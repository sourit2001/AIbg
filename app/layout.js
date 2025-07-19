import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  );
}
