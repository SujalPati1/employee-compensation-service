// Azure resources for the Employee Compensation Service.
//
// Deploy into an existing resource group:
//   az deployment group create -g <group> -f infra/main.bicep -p sqlAdminLogin=<upn> sqlAdminObjectId=<object-id>
//
// Passwordless by design:
//   - The Function App has a system-assigned managed identity.
//   - Storage has account-key access disabled; the app reaches it through its identity.
//   - Azure SQL accepts only Microsoft Entra sign-ins; the deploying user is its admin and
//     grants the app's identity read/write access with `npm run db:setup -- --azure <server> --grant-app <app>`.

@description('Azure region. Must be one the subscription policy allows; Flex Consumption is required.')
param location string = resourceGroup().location

@description('Short name used in every resource name.')
@minLength(3)
@maxLength(12)
param appName string = 'compensation'

@description('User principal name of the Entra user who administers the SQL server (you).')
param sqlAdminLogin string

@description('Object ID of that Entra user.')
param sqlAdminObjectId string

// Function App and SQL server names are public DNS names, so they must be globally unique.
var suffix = take(uniqueString(resourceGroup().id), 6)
var functionAppName = 'func-${appName}-${suffix}'
var storageAccountName = take('st${replace(appName, '-', '')}${suffix}', 24)
var sqlServerName = 'sql-${appName}-${suffix}'
var sqlDatabaseName = 'Compensation'
var deploymentContainerName = 'deployment-package'

// ---------------------------------------------------------------- Monitoring

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${appName}-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    // Hard ceiling on ingestion per day, so telemetry can never eat into the credit.
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ---------------------------------------------------------------- Storage (Functions host + deployment package)

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowSharedKeyAccess: false // identity only: no account keys to leak
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
}

// ---------------------------------------------------------------- Function App (Flex Consumption)

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${appName}-${suffix}'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        // Functions host storage, reached with the app's identity instead of a connection string.
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        // Database settings read by src/db/config.ts. No user or password: SQL_AUTH=entra.
        { name: 'SQL_AUTH', value: 'entra' }
        { name: 'SQL_SERVER', value: '${sqlServerName}${environment().suffixes.sqlServerHostname}' }
        { name: 'SQL_PORT', value: '1433' }
        { name: 'SQL_DATABASE', value: sqlDatabaseName }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        // Caps scale-out so a burst of traffic cannot exhaust a 1-vCore database's connections.
        maximumInstanceCount: 40
      }
      runtime: {
        name: 'node'
        version: '24'
      }
    }
  }
}

// Built-in role IDs: https://learn.microsoft.com/azure/role-based-access-control/built-in-roles
var storageRoles = {
  blobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  queueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  tableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
}

resource storageRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for role in items(storageRoles): {
    name: guid(storage.id, functionApp.id, role.value)
    scope: storage
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role.value)
      principalId: functionApp.identity.principalId
      principalType: 'ServicePrincipal'
    }
  }
]

// ---------------------------------------------------------------- Azure SQL (free offer)

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'User'
      login: sqlAdminLogin
      sid: sqlAdminObjectId
      tenantId: subscription().tenantId
      azureADOnlyAuthentication: true // SQL logins and passwords are disabled entirely
    }
  }
  // Created only after the Function App succeeds. The first free-offer database fixes the
  // free-offer region for the whole subscription, so it must not be created in a region
  // where the rest of the app cannot run.
  dependsOn: [functionApp]
}

// Lets Azure services (including this Function App, whose outbound IPs change) reach the server.
// Access still requires an Entra identity that has been granted a database user.
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1 // maximum vCores
  }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause' // pause until next month rather than bill
    minCapacity: json('0.5')
    // Minutes idle before pausing. Free-offer databases reject the general serverless minimum
    // of 15 ("does not support auto pause delay value '15'"), so the free-offer default is used.
    autoPauseDelay: 60
    maxSizeBytes: 34359738368 // 32 GB, the free-offer limit
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
  }
}

// ---------------------------------------------------------------- Outputs

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output sqlServerName string = sqlServer.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.name
output storageAccountName string = storage.name
