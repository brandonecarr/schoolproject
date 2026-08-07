import { requireRole } from "@/lib/auth";
import { NotificationCentre } from "@/components/NotificationCentre";
import { EmailAlertToggle } from "@/components/EmailAlertToggle";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications — Cohort" };

export default async function StudentNotificationsPage() {
  const { user } = await requireRole("student");
  return (
    <>
      <NotificationCentre back="/student/notifications" />
      <EmailAlertToggle
        enabled={user.emailAlerts}
        configured={emailConfigured()}
        back="/student/notifications"
      />
    </>
  );
}
