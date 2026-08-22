import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProfessionalStation · 任务计划",
  description: "一个给单个使用者的任务系统：把方法论做成约束，而不是做成视图。",
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
