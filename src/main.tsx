import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize theme from localStorage
const theme = localStorage.getItem("theme") || "light";
document.documentElement.classList.add(theme);

createRoot(document.getElementById("root")!).render(<App />);
