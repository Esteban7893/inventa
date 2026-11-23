import { logout } from "@/app/(app)/actions";
import { requireUser } from "@/lib/auth";

export async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden truncate text-sm text-zinc-600 sm:inline" title={user.email}>
        {user.email}
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
