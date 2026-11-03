import { SkeletonPageHead, SkeletonChecklistGrid } from "@/components/ui/Skeleton";
import { Panel } from "@/components/ui/Panel";

export default function Loading() {
  return (
    <div>
      <SkeletonPageHead />
      <Panel>
        <SkeletonChecklistGrid />
      </Panel>
    </div>
  );
}
