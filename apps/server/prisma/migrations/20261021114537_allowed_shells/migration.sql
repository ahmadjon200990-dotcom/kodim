-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "durationMin" INTEGER NOT NULL,
    "startedAt" DATETIME,
    "endsAt" DATETIME,
    "template" TEXT NOT NULL DEFAULT 'EMPTY',
    "starterFiles" JSONB NOT NULL,
    "referenceFiles" JSONB NOT NULL,
    "criteria" JSONB NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiModel" TEXT NOT NULL DEFAULT 'DEFAULT',
    "allowedPackages" JSONB NOT NULL,
    "allowedCommands" JSONB NOT NULL DEFAULT [],
    "allowedShells" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("aiEnabled", "aiModel", "allowedCommands", "allowedPackages", "code", "createdAt", "criteria", "durationMin", "endsAt", "id", "referenceFiles", "startedAt", "starterFiles", "status", "teacherId", "template", "title") SELECT "aiEnabled", "aiModel", "allowedCommands", "allowedPackages", "code", "createdAt", "criteria", "durationMin", "endsAt", "id", "referenceFiles", "startedAt", "starterFiles", "status", "teacherId", "template", "title" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
CREATE UNIQUE INDEX "Exam_code_key" ON "Exam"("code");
CREATE INDEX "Exam_teacherId_idx" ON "Exam"("teacherId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
