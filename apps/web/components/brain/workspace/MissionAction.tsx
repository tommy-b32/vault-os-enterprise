import Link from "next/link";

import VaultIcon from "@/components/brain/workspace/VaultIcon";
import type { Mission } from "@/types/missions";

type MissionActionProps = {
  mission: Mission;
};

export default function MissionAction({
  mission,
}: MissionActionProps) {
  const primaryAction = mission.actions.find(
    (action) => action.kind === "primary",
  );

  if (!primaryAction?.href) {
    return null;
  }

  return (
    <Link
      className="vault-primary-button mission-action-button"
      href={primaryAction.href}
    >
      {primaryAction.label}
      <VaultIcon name="arrow" size={16} />
    </Link>
  );
}
