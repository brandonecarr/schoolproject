-- Curriculum structure: pages, modules, module items, and page progress.

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "courseId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "unlockAt" TEXT NOT NULL DEFAULT '',
    "requireSequential" BOOLEAN NOT NULL DEFAULT false,
    "prereqModuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "minScore" INTEGER,

    CONSTRAINT "ModuleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleProgress" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "moduleItemId" TEXT NOT NULL,
    "completedAt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Page_schoolId_idx" ON "Page"("schoolId");

-- CreateIndex
CREATE INDEX "Module_schoolId_idx" ON "Module"("schoolId");

-- CreateIndex
CREATE INDEX "ModuleItem_moduleId_idx" ON "ModuleItem"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleItem_schoolId_idx" ON "ModuleItem"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleProgress_studentId_moduleItemId_key" ON "ModuleProgress"("studentId", "moduleItemId");

-- CreateIndex
CREATE INDEX "ModuleProgress_schoolId_idx" ON "ModuleProgress"("schoolId");

-- Row Level Security: enabled with no policies, matching every other table.
ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Module" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleProgress" ENABLE ROW LEVEL SECURITY;
