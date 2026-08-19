import { FxChat } from "@/components/fx-chat";
import { DEFAULT_FX_MODEL } from "@/lib/fx-model";

export default function Home() {
  return (
    <FxChat
      configured={Boolean(process.env.AI_GATEWAY_API_KEY)}
      model={process.env.FX_MODEL?.trim() || DEFAULT_FX_MODEL}
    />
  );
}
