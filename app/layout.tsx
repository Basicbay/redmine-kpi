import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ประเมินผลงาน 2569 | Redmine",
  description: "งาน โครงการ และแบบประเมินผลงานประจำปีจาก Redmine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
