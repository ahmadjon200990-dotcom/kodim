import type { ExamStatus } from "@exam-ide/shared";
import { uz } from "../uz";

export function StatusBadge({ status }: { status: ExamStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{uz.status[status]}</span>;
}
