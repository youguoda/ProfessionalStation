import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfessionalStation · 任务计划",
  description: "一个方法无关的任务计划网站：GTD / 看板 / 四象限 / PARA 多工作流可切换。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
