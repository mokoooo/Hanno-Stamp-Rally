import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const SESSION_KEY = "stamp_session_token";

setAuthTokenGetter(() => localStorage.getItem(SESSION_KEY));

createRoot(document.getElementById("root")!).render(<App />);
