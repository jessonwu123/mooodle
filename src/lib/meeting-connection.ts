export function canConnectMeetingPlugin(loading: boolean, hasSession: boolean, isTeacher: boolean, enabled: boolean) {
  return !loading && hasSession && isTeacher && enabled;
}