/*
  001_schema.sql
  Creates the Department and Employee tables described in the assignment.

  Safe to run repeatedly: each table is created only if it does not already exist,
  so existing data is never dropped.

  Additions to the brief's schema (all additive, none change a column type):
    - Named PRIMARY KEY, FOREIGN KEY and CHECK constraints.
    - CHECK (Salary > 0): rules out negative pay and divide-by-zero in the bonus % report.
    - CHECK (Bonus >= 0): rules out negative bonuses. A NULL bonus still passes, because
      a CHECK only rejects rows where the condition is FALSE, and NULL >= 0 is UNKNOWN.
    - UTF-8 collation on VARCHAR columns, so names such as "Zoë" or "Łukasz" are stored
      correctly while keeping the VARCHAR types from the brief.
    - An index on Employee.DepartmentID for the department filter and joins.

  Columns the brief does not mark "Not null" (Department.Location, Employee.DepartmentID,
  Employee.Bonus, Employee.HireDate) are nullable, following the brief literally.
*/

IF OBJECT_ID(N'dbo.Department', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Department
    (
        DepartmentID   INT          NOT NULL,
        DepartmentName VARCHAR(100) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NOT NULL,
        Location       VARCHAR(100) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NULL,

        CONSTRAINT PK_Department PRIMARY KEY (DepartmentID),
        CONSTRAINT CK_Department_Name_NotBlank CHECK (LEN(DepartmentName) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.Employee', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employee
    (
        EmployeeID   INT IDENTITY(1, 1) NOT NULL,
        FirstName    VARCHAR(50) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NOT NULL,
        LastName     VARCHAR(50) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NOT NULL,
        DepartmentID INT           NULL,
        Salary       DECIMAL(12, 2) NOT NULL,
        Bonus        DECIMAL(12, 2) NULL,   -- NULL = no bonus awarded
        HireDate     DATE           NULL,

        CONSTRAINT PK_Employee PRIMARY KEY (EmployeeID),
        CONSTRAINT FK_Employee_Department FOREIGN KEY (DepartmentID) REFERENCES dbo.Department (DepartmentID),
        CONSTRAINT CK_Employee_Salary_Positive CHECK (Salary > 0),
        CONSTRAINT CK_Employee_Bonus_NonNegative CHECK (Bonus >= 0),
        CONSTRAINT CK_Employee_FirstName_NotBlank CHECK (LEN(FirstName) > 0),
        CONSTRAINT CK_Employee_LastName_NotBlank CHECK (LEN(LastName) > 0)
    );

    CREATE INDEX IX_Employee_DepartmentID ON dbo.Employee (DepartmentID);
END;
GO
