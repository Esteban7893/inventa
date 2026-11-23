import { logout } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex min-w-0 items-center gap-4">
      <span className="figures hidden truncate text-[13px] text-ink-soft sm:inline" title={user.email}>
        {user.email}
      </span>
      <form action={logout}>
        <Button type="submit" variant="secondary" size="sm">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
