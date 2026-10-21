-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "figmaHandle" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "figmaToken" TEXT;

-- CreateTable
CREATE TABLE "FigmaCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "data" JSONB,
    "fetchedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FigmaCache_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FigmaImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheId" TEXT NOT NULL,
    "frameId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'png',
    "scale" INTEGER NOT NULL DEFAULT 2,
    "bytes" BLOB NOT NULL,
    CONSTRAINT "FigmaImage_cacheId_fkey" FOREIGN KEY ("cacheId") REFERENCES "FigmaCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FigmaCache_teacherId_url_key" ON "FigmaCache"("teacherId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "FigmaImage_cacheId_frameId_key" ON "FigmaImage"("cacheId", "frameId");
