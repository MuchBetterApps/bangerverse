export type MailThread = {
  id: string; mailbox_id: string; subject: string; snippet: string; last_message_at: string;
  message_count: number; unread_count: number; is_archived: boolean; is_trash: boolean;
  is_starred: boolean; is_sent: boolean; has_attachments: boolean;
  labels: string[]; participants: { name: string | null; email: string }[];
};

const people = [
  ["Maya Chen", "maya@northstar.design", "Design review notes for the dashboard", "I've added the updated layouts and a few notes on the empty states. Let me know what you think.", "9:42 AM", true, false, ["Projects"]],
  ["Linear", "notifications@linear.app", "Your team's weekly update", "A quick look at what your team shipped this week and what's coming next.", "8:16 AM", true, false, ["Updates"]],
  ["Alex Rivera", "alex@studiofield.co", "Re: Friday lunch?", "Sounds good! Let's meet at the little place on the corner around 12:30.", "Yesterday", false, false, []],
  ["Figma", "team@figma.com", "Your new design files are ready", "Explore the latest updates to your team projects and shared libraries.", "Yesterday", false, true, ["Design"]],
  ["Jordan Lee", "jordan@brightpath.io", "Q3 planning documents", "Hi team, attaching the planning docs we discussed in yesterday's meeting.", "Sep 21", true, true, ["Work"]],
  ["Notion", "team@email.notion.so", "What's new in your workspace", "Your workspace is looking good. Here are a few ways to keep momentum going.", "Sep 20", false, false, ["Updates"]],
  ["Priya Shah", "priya@northstar.design", "Re: Launch timeline", "Thanks for sending this over. The timeline looks great from my side.", "Sep 19", false, true, ["Projects"]],
  ["GitHub", "notifications@github.com", "[mailG] Review requested: Polish inbox view", "You have been requested to review a pull request in mailG.", "Sep 18", false, false, ["Updates"]],
  ["Daniel Foster", "daniel@weave.studio", "Following up on our conversation", "It was great connecting this week. Here's the information I promised to share.", "Sep 17", false, false, []],
  ["The Browser", "hello@thebrowser.com", "The best writing on the internet", "A thoughtfully selected collection of stories for your weekend.", "Sep 15", false, false, ["Reading"]],
  ["Olivia Park", "olivia@meridian.co", "Moodboard and references", "I've put together the initial moodboard. Take a look when you have a moment.", "Sep 14", false, true, ["Design"]],
  ["Stripe", "notifications@stripe.com", "Your August 2026 summary is here", "Your monthly account summary is available to view.", "Sep 13", false, false, ["Finance"]],
  ["Elliot Graham", "elliot@northstar.design", "Team offsite details", "Everything is confirmed for next month's offsite. Here's the schedule.", "Sep 11", false, false, ["Work"]],
  ["Superhuman", "team@superhuman.com", "Three ideas for a calmer inbox", "Little changes to your workflow can make a big difference.", "Sep 10", false, false, ["Reading"]],
  ["Avery Morgan", "avery@brightpath.io", "Re: Catching up", "Would love to hear how things are going. Are you free sometime next week?", "Sep 9", false, false, []],
  ["Kai Bennett", "kai@northstar.design", "Feedback on the prototype", "I left comments in the file this morning. The new flow is much clearer.", "Sep 8", false, false, ["Projects"]],
  ["Dropbox", "no-reply@dropbox.com", "Your files are ready to share", "The files you uploaded are available in your shared folder.", "Sep 7", false, false, ["Updates"]],
  ["Elena Brooks", "elena@studiofield.co", "Photography selects", "Here are the selects from last week's shoot, organized by scene.", "Sep 6", true, true, ["Design"]],
  ["Sam Patel", "sam@studiofield.co", "Quick question about the proposal", "Could we move the presentation up to Wednesday afternoon?", "Sep 5", false, false, ["Work"]],
  ["Webflow", "hello@webflow.com", "Your weekly site report", "A summary of activity across your published projects.", "Sep 4", false, false, ["Updates"]],
  ["Morgan & Co.", "team@morgan.co", "September project check-in", "A short recap of progress, decisions, and the next milestones.", "Sep 3", false, false, ["Projects"]],
  ["Riley Thompson", "riley@example.com", "Weekend plans", "The forecast looks perfect. Want to meet up at the park?", "Sep 2", true, false, []],
  ["Travel Desk", "bookings@traveldesk.com", "Your itinerary is confirmed", "Your trip details and confirmation number are attached.", "Sep 1", false, true, ["Personal"]],
] as const;

export const demoThreads: MailThread[] = people.map((p, i) => ({
  id: `demo-${i + 1}`, mailbox_id: i < 17 ? "demo-mailbox" : i < 21 ? "studio-mailbox" : "personal-mailbox", subject: p[2], snippet: p[3],
  last_message_at: p[4], message_count: i === 2 || i === 6 ? 2 : 1,
  unread_count: p[5] ? 1 : 0, is_archived: false, is_trash: false, is_starred: i === 2 || i === 6,
  is_sent: false, has_attachments: p[6], labels: [...p[7]], participants: [{ name: p[0], email: p[1] }],
}));

export const demoLabels = [
  { id: "projects", name: "Projects", color: "#7baaf7" },
  { id: "design", name: "Design", color: "#c58af9" },
  { id: "work", name: "Work", color: "#58b8a9" },
  { id: "finance", name: "Finance", color: "#f4a764" },
  { id: "reading", name: "Reading", color: "#e4819d" },
  { id: "updates", name: "Updates", color: "#89a4bd" },
];

export const demoLabelsByMailbox: Record<string, typeof demoLabels> = {
  "demo-mailbox": demoLabels,
  "studio-mailbox": demoLabels.filter(label => ["Projects", "Design", "Work", "Updates"].includes(label.name)),
  "personal-mailbox": [{ id: "personal", name: "Personal", color: "#68aa7c" }],
};

export const demoMailboxes = [
  { id: "demo-mailbox", address: "alex@northstar.design", display_name: "Northstar" },
  { id: "studio-mailbox", address: "hello@studiofield.co", display_name: "Studiofield" },
  { id: "personal-mailbox", address: "alex@example.com", display_name: "Personal" },
];
