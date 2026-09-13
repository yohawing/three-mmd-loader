import { defineConfig } from "blume";

export default defineConfig({
  title: "three-mmd-loader",
  description: "TypeScript-first Three.js MMD loading and playback.",
  feedback: false,
  github: {
    owner: "yohawing",
    repo: "three-mmd-loader",
    branch: "main"
  },
  content: {
    root: "../docs",
    exclude: ["**/_*", "**/.*", "RELEASE.md", "DEPLOY.md", "plans/**", "TODO.md", "ROADMAP.md", "roadmap.md", "PLAN.md"]
  },
  navigation: {
    repo: true,
    sidebar: {
      display: "group"
    },
    tabs: [
      { label: "ドキュメント", path: "/" },
      { label: "API", path: "/api" }
    ]
  }
});
