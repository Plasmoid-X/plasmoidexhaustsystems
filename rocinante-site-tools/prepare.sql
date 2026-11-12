-- Department demo: the Chief Officer also reads and writes the Bridge (as on most yachts), and the
-- people the demo signs in as follow the browser's light/dark setting.
INSERT INTO "DepartmentGrant" (id, "roleId", "departmentId", level)
SELECT 'demo-co-bridge', r.id, d.id, 'EDIT' FROM "CrewRole" r, "Department" d
WHERE r.name = 'Chief Officer' AND d.key = 'bridge'
ON CONFLICT ("roleId", "departmentId") DO UPDATE SET level = 'EDIT';
DELETE FROM "UserPreference" WHERE "userId" IN (SELECT id FROM "User" WHERE username IN
  ('demo captain','jamie lee','demo chief engineer','tom becker','demo chief stew'));
