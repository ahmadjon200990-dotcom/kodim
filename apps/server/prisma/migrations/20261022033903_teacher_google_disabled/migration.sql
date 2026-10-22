-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "figmaToken" TEXT,
    "figmaHandle" TEXT,
    "googleId" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME
);
INSERT INTO "new_Teacher" ("createdAt", "email", "figmaHandle", "figmaToken", "id", "name", "passwordHash", "role") SELECT "createdAt", "email", "figmaHandle", "figmaToken", "id", "name", "passwordHash", "role" FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");
CREATE UNIQUE INDEX "Teacher_googleId_key" ON "Teacher"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
