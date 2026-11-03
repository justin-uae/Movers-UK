import { SkeletonPageHead, SkeletonPanelLines } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <SkeletonPageHead />
      <div className="space-y-4">
        <SkeletonPanelLines lines={8} />
        <SkeletonPanelLines lines={2} />
      </div>
    </div>
  );
}
