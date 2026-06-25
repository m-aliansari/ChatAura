import { useColorMode } from "../../ui/color-mode.jsx";

export const FlatLogo = ({ width = "auto", height = "auto" }) => {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? (
    <img
      src="/ChatAura_logo_flat_dark.png"
      alt="Chat Aura Logo"
      width={width}
      height={height}
    />
  ) : (
    <img
      src="/ChatAura_logo_flat_light.png"
      alt="Chat Aura Logo"
      width={width}
      height={height}
    />
  );
};
