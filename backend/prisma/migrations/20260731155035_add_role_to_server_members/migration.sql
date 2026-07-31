-- CreateEnum
CREATE TYPE "ServerMemberRole" AS ENUM ('admin', 'member');

-- AlterTable
ALTER TABLE "server_members" ADD COLUMN "role" "ServerMemberRole" NOT NULL DEFAULT 'member';
