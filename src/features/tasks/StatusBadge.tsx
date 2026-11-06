import type { TaskStatus } from '../../lib/types';
import { STATUS_LABELS } from '../../lib/workflow';
export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
