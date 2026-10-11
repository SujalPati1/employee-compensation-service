/*
  003_seed.sql
  Demo data. Running it RESETS both tables to exactly this data (useful before a demo).

  Explicit IDs are inserted so example requests (e.g. GET /api/employees/1) always match.

  Edge cases included on purpose:
    - NULL bonus:              Meera (2), Priya (8), Vikram (9)
    - Bonus of exactly 0:      Rohan (3), a recorded award of zero, not "never received"
    - No department:           Arjun (11)
    - Department with no staff: Research (4)
    - Department with no location: Human Resources (3)
    - No hire date:            Łukasz (7)
    - Tie for highest salary:  Aarav (1) and Meera (2), both 150,000.00
    - Highest total pay is someone else: Neha (10), 140,000 + 30,000 = 170,000
    - Tied bonuses for ranking: Kabir (5) and Neha (10), both 30,000.00
    - Names outside plain ASCII: Zoë (4), Łukasz (7)

  Expected report results with this data:
    Total bonus                         124,000.00
    Never received a bonus              Meera, Priya, Vikram
    Department bonus > average salary   Sales (75,000.00 > 70,000.00)
    Top salary                          Aarav and Meera; neither has the highest total pay
*/

SET XACT_ABORT ON;   -- any error rolls back the whole reset
BEGIN TRANSACTION;

DELETE FROM dbo.Employee;
DELETE FROM dbo.Department;

INSERT INTO dbo.Department (DepartmentID, DepartmentName, Location)
VALUES
    (1, 'Engineering',     'Pune'),
    (2, 'Sales',           'Mumbai'),
    (3, 'Human Resources', NULL),
    (4, 'Research',        'Bengaluru'),
    (5, 'Finance',         'Mumbai');

SET IDENTITY_INSERT dbo.Employee ON;

INSERT INTO dbo.Employee (EmployeeID, FirstName, LastName, DepartmentID, Salary, Bonus, HireDate)
VALUES
    ( 1, N'Aarav',  N'Sharma',    1,    150000.00,  5000.00, '2018-04-01'),
    ( 2, N'Meera',  N'Iyer',      1,    150000.00,     NULL, '2019-07-15'),
    ( 3, N'Rohan',  N'Desai',     1,     95000.00,     0.00, '2021-01-10'),
    ( 4, N'Zoë',    N'Fernandes', 1,    110000.00, 10000.00, '2020-03-02'),
    ( 5, N'Kabir',  N'Mehta',     2,     60000.00, 30000.00, '2022-06-01'),
    ( 6, N'Ananya', N'Rao',       2,     70000.00, 25000.00, '2021-09-20'),
    ( 7, N'Łukasz', N'Nowak',     2,     80000.00, 20000.00, NULL),
    ( 8, N'Priya',  N'Nair',      3,     55000.00,     NULL, '2023-02-14'),
    ( 9, N'Vikram', N'Singh',     3,     65000.00,     NULL, '2017-11-30'),
    (10, N'Neha',   N'Kulkarni',  5,    140000.00, 30000.00, '2016-08-22'),
    (11, N'Arjun',  N'Patel',     NULL,  72000.00,  4000.00, '2024-05-06');

SET IDENTITY_INSERT dbo.Employee OFF;

-- Continue numbering after the highest inserted ID, so the next new employee gets 12.
-- An explicit value is needed: RESEED without one never lowers a counter that earlier
-- inserts (since deleted) had pushed higher.
DECLARE @maxEmployeeId INT = (SELECT MAX(EmployeeID) FROM dbo.Employee);
DBCC CHECKIDENT ('dbo.Employee', RESEED, @maxEmployeeId) WITH NO_INFOMSGS;

COMMIT TRANSACTION;
GO
