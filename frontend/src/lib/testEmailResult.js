export const getTestEmailNotice = (response = {}) => {
  const delivery = response.delivery;
  if (delivery?.status === "smtp_accepted" && delivery.accepted?.length) {
    return {
      type: "success",
      title: "SMTP accepted",
      message: `The SMTP provider accepted the test email for ${response.recipient || delivery.accepted.join(", ")}. Inbox delivery is not confirmed. If it does not arrive, check the provider's delivery logs.`,
    };
  }
  return {
    type: "warning",
    title: "Delivery not confirmed",
    message: delivery?.status === "partially_accepted"
      ? "The provider rejected some recipients. Inspect the test-email response and provider delivery logs."
      : "The request completed, but the server did not report SMTP recipient acceptance. Inbox delivery is not confirmed.",
  };
};
