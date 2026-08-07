-- Inline annotation pins on uploaded student work. Coordinates are fractions
-- of the image (0..1), not pixels — see the model comment in schema.prisma.

CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Annotation_submissionId_idx" ON "Annotation"("submissionId");
CREATE INDEX "Annotation_fileId_idx" ON "Annotation"("fileId");

ALTER TABLE "Annotation" ENABLE ROW LEVEL SECURITY;
