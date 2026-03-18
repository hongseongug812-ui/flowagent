import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthContext, useAuthProvider } from "./hooks/useAuth";

function Root() {
  const auth = useAuthProvider();
  return (
    <AuthContext.Provider value={auth}>
      <App />
    </AuthContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
