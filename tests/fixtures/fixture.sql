/*
  fixture.sql
  Fixed data for the integration tests. Resets both tables in the TEST database only.
  Expected results for every report are worked out by hand in tests/fixtures/EXPECTED.md.

  Do not change a value here without updating EXPECTED.md and the tests.

  Cases covered:
    Alpha  total bonus 50,000 > average salary 40,000, and it includes a NULL bonus (Eve)
    Beta   total bonus 50,000 = average salary 50,000 exactly: must NOT count as "exceeds"
    Gamma  every bonus is NULL: total bonus 0
    Delta  no employees
    Kai, Lia, Max have no department
    Max    bonus of exactly 0: a recorded award, not "never received"
    Lia    bonus 201 on salary 20,000 = 1.005%: rounds to 1.01 in exact DECIMAL maths,
           while JavaScript floating point (Math.round(1.005 * 100) / 100) gives 1.00
    Dan    bonus larger than salary: 133.33%
    Finn and Kai share a bonus of 10,000 (ranking tie); Eve, Ivy and Jon share last place (NULL)
    Ivy    highest salary, NULL bonus; total compensation 100,000 ties with Kai (90,000 + 10,000).
           A query that adds Salary + Bonus without COALESCE gets NULL for Ivy and wrongly
           reports that she is not the highest earner.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

DELETE FROM dbo.Employee;
DELETE FROM dbo.Department;

INSERT INTO dbo.Department (DepartmentID, DepartmentName, Location)
VALUES
    (1, 'Alpha', 'Pune'),
    (2, 'Beta',  NULL),
    (3, 'Gamma', 'Mumbai'),
    (4, 'Delta', 'Delhi');

SET IDENTITY_INSERT dbo.Employee ON;

INSERT INTO dbo.Employee (EmployeeID, FirstName, LastName, DepartmentID, Salary, Bonus, HireDate)
VALUES
    ( 1, N'Dan',  N'Alpha-One',   1,     30000.00, 40000.00, '2020-01-15'),
    ( 2, N'Eve',  N'Alpha-Two',   1,     50000.00,     NULL, '2019-03-01'),
    ( 3, N'Finn', N'Alpha-Three', 1,     40000.00, 10000.00, '2021-06-30'),
    ( 4, N'Gus',  N'Beta-One',    2,     60000.00, 30000.00, '2018-11-11'),
    ( 5, N'Hana', N'Beta-Two',    2,     40000.00, 20000.00, NULL),
    ( 6, N'Ivy',  N'Gamma-One',   3,    100000.00,     NULL, '2015-05-05'),
    ( 7, N'Jon',  N'Gamma-Two',   3,     20000.00,     NULL, '2023-09-09'),
    ( 8, N'Kai',  N'NoDept-One',  NULL,  90000.00, 10000.00, '2017-07-07'),
    ( 9, N'Lia',  N'NoDept-Two',  NULL,  20000.00,   201.00, '2024-02-29'),
    (10, N'Max',  N'NoDept-Three', NULL, 80000.00,     0.00, '2022-12-31');

SET IDENTITY_INSERT dbo.Employee OFF;

DECLARE @maxEmployeeId INT = (SELECT MAX(EmployeeID) FROM dbo.Employee);
DBCC CHECKIDENT ('dbo.Employee', RESEED, @maxEmployeeId) WITH NO_INFOMSGS;

COMMIT TRANSACTION;
GO
