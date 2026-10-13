import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Airways Dental Clinic | Gulshan-e-Iqbal, Karachi",
  description:
    "Dental clinic in Block 7, Gulshan-e-Iqbal near Maskan Chowrangi, Karachi. Book checkups, fillings, root canals and more 24/7 with our AI receptionist.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full scroll-smooth antialiased`}>
      <body className="min-h-full bg-white text-slate-800">{children}</body>
    </html>
  );
}
