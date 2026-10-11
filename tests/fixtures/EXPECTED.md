# Expected report results for the test fixture

Worked out by hand from `fixture.sql` **before** any report query was written.
The integration tests in `tests/integration/reports.test.ts` assert exactly these values.

## Fixture data

| ID | Name | Department | Salary | Bonus | Salary + bonus (NULL as 0) |
|---:|------|------------|-------:|------:|------:|
| 1 | Dan  | Alpha | 30,000.00 | 40,000.00 | 70,000.00 |
| 2 | Eve  | Alpha | 50,000.00 | NULL | 50,000.00 |
| 3 | Finn | Alpha | 40,000.00 | 10,000.00 | 50,000.00 |
| 4 | Gus  | Beta  | 60,000.00 | 30,000.00 | 90,000.00 |
| 5 | Hana | Beta  | 40,000.00 | 20,000.00 | 60,000.00 |
| 6 | Ivy  | Gamma | 100,000.00 | NULL | 100,000.00 |
| 7 | Jon  | Gamma | 20,000.00 | NULL | 20,000.00 |
| 8 | Kai  | (none) | 90,000.00 | 10,000.00 | 100,000.00 |
| 9 | Lia  | (none) | 20,000.00 | 201.00 | 20,201.00 |
| 10 | Max | (none) | 80,000.00 | 0.00 | 80,000.00 |

Department Delta (4) has no employees.

## 1. Total bonus

40,000 + 10,000 + 30,000 + 20,000 + 10,000 + 201 + 0 = **110,201.00**
(the three NULL bonuses count as 0)

With no employees at all the answer is **0.00**, not NULL.

## 2. Employees who have never received a bonus

**Eve (2), Ivy (6), Jon (7)**, the NULL bonuses.
Max (10) is not included: his bonus is a recorded 0.00 (assumption A1).

## 3. Bonus as a percentage of salary

Only employees with a bonus (NULL excluded, 0 included). Ordered by percentage, highest first, then ID.

| ID | Name | Calculation | Exact | Rounded |
|---:|------|-------------|------:|--------:|
| 1 | Dan  | 40,000 / 30,000 × 100 | 133.333… | **133.33** |
| 4 | Gus  | 30,000 / 60,000 × 100 | 50 | **50.00** |
| 5 | Hana | 20,000 / 40,000 × 100 | 50 | **50.00** |
| 3 | Finn | 10,000 / 40,000 × 100 | 25 | **25.00** |
| 8 | Kai  | 10,000 / 90,000 × 100 | 11.111… | **11.11** |
| 9 | Lia  | 201 / 20,000 × 100 | 1.005 | **1.01** |
| 10 | Max | 0 / 80,000 × 100 | 0 | **0.00** |

Lia is the rounding trap: exact decimal maths rounds 1.005 to 1.01, but JavaScript's
`Math.round(1.005 * 100) / 100` returns 1, because 1.005 cannot be stored exactly as a float.

## 4. Departments where total bonus exceeds average salary

| Department | Total bonus | Average salary | Exceeds? |
|------------|------------:|---------------:|:--------:|
| Alpha | 40,000 + 0 + 10,000 = 50,000 | (30,000 + 50,000 + 40,000) / 3 = 40,000 | **yes** |
| Beta  | 30,000 + 20,000 = 50,000 | (60,000 + 40,000) / 2 = 50,000 | no: equal is not "exceeds" |
| Gamma | 0 + 0 = 0 | (100,000 + 20,000) / 2 = 60,000 | no |
| Delta | (no employees) | (none) | no |

Result: **Alpha only**, with 3 employees, total bonus 50,000.00 and average salary 40,000.00.
Kai, Lia and Max have no department and are not part of this report.

## 5. Ranking by bonus (NULLs last, standard competition ranking)

| Rank | ID | Name | Bonus |
|-----:|---:|------|------:|
| 1 | 1 | Dan  | 40,000.00 |
| 2 | 4 | Gus  | 30,000.00 |
| 3 | 5 | Hana | 20,000.00 |
| 4 | 3 | Finn | 10,000.00 |
| 4 | 8 | Kai  | 10,000.00 |
| 6 | 9 | Lia  | 201.00 |
| 7 | 10 | Max | 0.00 |
| 8 | 2 | Eve  | NULL |
| 8 | 6 | Ivy  | NULL |
| 8 | 7 | Jon  | NULL |

All 10 employees appear; nobody is excluded. Ties share a rank and the next rank is skipped (4, 4, 6).

## 6. Highest salary, and whether that person also has the highest total compensation

- Highest salary: **100,000.00**, held only by **Ivy (6)**.
- Highest total compensation (salary + bonus, NULL as 0): **100,000.00**, shared by **Ivy (6)** and **Kai (8)**.
- So Ivy **does** also have the highest total compensation (`hasHighestTotalCompensation: true`), tied with Kai.

Trap: `Salary + Bonus` without `COALESCE` is NULL for Ivy, which would make Kai the only
top earner and wrongly report `false` for Ivy.

With no employees: highest values are `null` and both lists are empty.
