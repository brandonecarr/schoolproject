import { requireRole } from "@/lib/auth";
import { NotificationCentre } from "@/components/NotificationCentre";
import { EmailAlertToggle } from "@/components/EmailAlertToggle";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications — Cohort" };

export default async function ParentNotificationsPage() {
  const { user } = await requireRole("parent");
  return (
    <>
      <NotificationCentre back="/parent/notifications" />
      <EmailAlertToggle
        enabled={user.emailAlerts}
        configured={emailConfigured()}
        back="/parent/notifications"
      />
    </>
  );
}
