import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CollageEngine from "../collage-engine.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CollageEngine />
  </StrictMode>
);
