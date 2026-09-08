import { useState } from "react";
import { FlowList } from "./components/FlowList";
import { FlowBuilder } from "./components/FlowBuilder";

type View = { page: "list" } | { page: "builder"; flowId: string };

export default function App() {
  const [view, setView] = useState<View>({ page: "list" });

  if (view.page === "builder") {
    return (
      <FlowBuilder
        flowId={view.flowId}
        onBack={() => setView({ page: "list" })}
      />
    );
  }

  return (
    <FlowList onOpen={(id) => setView({ page: "builder", flowId: id })} />
  );
}
