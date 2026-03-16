function baseTemplate(content: string): string {
  return `
    <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #F8FAFB; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2C5F7C, #1A3D52); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">TrackZen</h1>
        <p style="color: #E8A44C; margin: 4px 0 0; font-size: 12px;">Unified Workforce Management</p>
      </div>
      <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
        ${content}
      </div>
      <p style="text-align: center; color: #6B7280; font-size: 12px; margin-top: 16px;">
        This is an automated message from TrackZen. Please do not reply.
      </p>
    </div>
  `;
}

export function tsApprovedEmail(recipientName: string, weekRange: string) {
  return {
    subject: `Your timesheet for ${weekRange} has been approved`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">Timesheet Approved</h2>
      <p style="color: #1F2937;">Hi ${recipientName},</p>
      <p style="color: #6B7280;">Your timesheet for <strong>${weekRange}</strong> has been approved.</p>
      <div style="background: #ECFDF5; border-left: 4px solid #52A675; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #065F46; margin: 0;">Status: <strong>Approved</strong></p>
      </div>
    `),
  };
}

export function tsRejectedEmail(recipientName: string, weekRange: string, reason: string) {
  return {
    subject: `Your timesheet for ${weekRange} was rejected`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">Timesheet Rejected</h2>
      <p style="color: #1F2937;">Hi ${recipientName},</p>
      <p style="color: #6B7280;">Your timesheet for <strong>${weekRange}</strong> was rejected.</p>
      <div style="background: #FEF2F2; border-left: 4px solid #D64545; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #991B1B; margin: 0;">Reason: ${reason}</p>
      </div>
      <p style="color: #6B7280;">Please review and resubmit your timesheet.</p>
    `),
  };
}

export function tsSubmittedEmail(managerName: string, employeeName: string, weekRange: string) {
  return {
    subject: `New timesheet awaiting your approval`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">New Timesheet Submitted</h2>
      <p style="color: #1F2937;">Hi ${managerName},</p>
      <p style="color: #6B7280;"><strong>${employeeName}</strong> has submitted a timesheet for <strong>${weekRange}</strong> that requires your approval.</p>
      <div style="background: #FFF7ED; border-left: 4px solid #E8A44C; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #9A3412; margin: 0;">Action Required: Review and approve/reject</p>
      </div>
    `),
  };
}

export function leaveApprovedEmail(recipientName: string, leaveType: string, dateRange: string) {
  return {
    subject: `Your leave request has been approved`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">Leave Request Approved</h2>
      <p style="color: #1F2937;">Hi ${recipientName},</p>
      <p style="color: #6B7280;">Your <strong>${leaveType}</strong> leave request for <strong>${dateRange}</strong> has been approved.</p>
      <div style="background: #ECFDF5; border-left: 4px solid #52A675; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #065F46; margin: 0;">Status: <strong>Approved</strong></p>
      </div>
    `),
  };
}

export function leaveRejectedEmail(recipientName: string, leaveType: string, dateRange: string, comment: string) {
  return {
    subject: `Your leave request was rejected`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">Leave Request Rejected</h2>
      <p style="color: #1F2937;">Hi ${recipientName},</p>
      <p style="color: #6B7280;">Your <strong>${leaveType}</strong> leave request for <strong>${dateRange}</strong> was rejected.</p>
      <div style="background: #FEF2F2; border-left: 4px solid #D64545; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #991B1B; margin: 0;">Comment: ${comment}</p>
      </div>
    `),
  };
}

export function leaveSubmittedEmail(managerName: string, employeeName: string, leaveType: string, dateRange: string) {
  return {
    subject: `New leave request awaiting your approval`,
    html: baseTemplate(`
      <h2 style="color: #1F2937; margin: 0 0 16px;">New Leave Request</h2>
      <p style="color: #1F2937;">Hi ${managerName},</p>
      <p style="color: #6B7280;"><strong>${employeeName}</strong> has submitted a <strong>${leaveType}</strong> leave request for <strong>${dateRange}</strong> that requires your approval.</p>
      <div style="background: #FFF7ED; border-left: 4px solid #E8A44C; padding: 12px; border-radius: 4px; margin: 16px 0;">
        <p style="color: #9A3412; margin: 0;">Action Required: Review and approve/reject</p>
      </div>
    `),
  };
}
