import { Database } from "lucide-react";
import { Panel } from "./Panel";
import { PageHead } from "./PageHead";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div>
      <PageHead
        eyebrow="Enterprise Module"
        title={title}
        text="This module is part of the full CRM roadmap and will connect to live data in a later phase."
      />
      <Panel>
        <div className="grid min-h-[420px] place-items-center text-center">
          <div>
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-primary-500">
              <Database size={36} />
            </div>
            <h2 className="mt-5 text-2xl font-black">{title} workspace</h2>
            <p className="mx-auto mt-2 max-w-lg text-slate-500">
              Navigation and layout are ready. This module is scheduled in a
              later build phase — see the project roadmap for sequencing.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
