import SettingsPanel from "@/components/settings/SettingsPanel";
import EmailConfigurationCard from "@/components/settings/EmailConfigurationCard";

const SMTPConfigurationSettings = ({ personalAccountMode = false, ...props }) => (
  <SettingsPanel
    title="SMTP Configuration"
    description={
      personalAccountMode
        ? "View and edit SMTP credentials for your personal tester mail account."
        : "View and edit SMTP credentials for the currently selected workspace sender."
    }
  >
    <EmailConfigurationCard
      {...props}
      embedded
      defaultExpanded
      personalAccountMode={personalAccountMode}
    />
  </SettingsPanel>
);

export default SMTPConfigurationSettings;
