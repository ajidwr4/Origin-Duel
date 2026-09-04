import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <main>
    <h1>Origin Duel</h1>
    <p>Bootstrap application shell.</p>
  </main>,
);
