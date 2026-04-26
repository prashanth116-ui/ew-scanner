import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-2 text-6xl font-bold text-[#333]">404</h1>
      <h2 className="mb-4 text-xl font-semibold text-white">
        Page not found
      </h2>
      <p className="mb-8 max-w-md text-sm text-[#a0a0a0]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-[#185FA5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6dba]"
        >
          EW Scanner
        </Link>
        <Link
          href="/squeeze"
          className="rounded-md border border-[#2a2a2a] px-5 py-2.5 text-sm font-medium text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
        >
          Squeeze
        </Link>
        <Link
          href="/prerun"
          className="rounded-md border border-[#2a2a2a] px-5 py-2.5 text-sm font-medium text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
        >
          Pre-Run
        </Link>
      </div>
    </div>
  );
}
