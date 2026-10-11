/*
  002_views.sql
  vw_EmployeeCompensation: the single place where the optional 5% default bonus is defined.

  Read-time rule: the default is calculated when data is read and never written to the table.
  A stored NULL keeps meaning "no bonus awarded", so the Part B reports (which read the base
  tables) stay literal, and the default always follows the employee's current salary.

  Columns added to each employee:
    EffectiveBonus              Bonus if one was awarded, otherwise 5% of Salary (2 dp)
    IsDefaultBonus              1 when EffectiveBonus came from the default rule
    TotalCompensation           Salary + Bonus, with no bonus counted as 0 (same rule as the reports)
    EffectiveTotalCompensation  Salary + EffectiveBonus

  ROUND in SQL Server rounds halves away from zero (e.g. 0.125 -> 0.13).
  Totals use DECIMAL(13, 2) because Salary + Bonus can exceed DECIMAL(12, 2).
*/

CREATE OR ALTER VIEW dbo.vw_EmployeeCompensation
AS
SELECT
    e.EmployeeID,
    e.FirstName,
    e.LastName,
    e.DepartmentID,
    d.DepartmentName,
    e.Salary,
    e.Bonus,
    e.HireDate,
    CAST(COALESCE(e.Bonus, ROUND(e.Salary * 0.05, 2)) AS DECIMAL(12, 2))          AS EffectiveBonus,
    CAST(CASE WHEN e.Bonus IS NULL THEN 1 ELSE 0 END AS BIT)                       AS IsDefaultBonus,
    CAST(e.Salary + COALESCE(e.Bonus, 0) AS DECIMAL(13, 2))                        AS TotalCompensation,
    CAST(e.Salary + COALESCE(e.Bonus, ROUND(e.Salary * 0.05, 2)) AS DECIMAL(13, 2)) AS EffectiveTotalCompensation
FROM dbo.Employee AS e
LEFT JOIN dbo.Department AS d   -- LEFT JOIN keeps employees who have no department
    ON d.DepartmentID = e.DepartmentID;
GO
