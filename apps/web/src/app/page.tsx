import { FxChat } from "@/components/fx-chat";
import { getFxDisplayModel, isFxConfigured } from "@/lib/fx-model";

export default function Home() {
  return (
    <FxChat
      configured={isFxConfigured()}
      model={getFxDisplayModel()}
    />
  );
}
