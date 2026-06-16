-- Remap all good_deeds to Curt's 6 categories:
-- NOTICE, CONNECT, CELEBRATE, ENCOURAGE, HELP, DELIGHT

UPDATE good_deeds SET category = 'NOTICE' WHERE deed_text IN (
  'Practice active listening in every conversation today',
  'Offer your seat to someone on public transit',
  'Check in on an elderly neighbor',
  'Spend quality time with a friend without looking at your phone',
  'Compliment a stranger genuinely',
  'Leave an encouraging note for a stranger to find',
  'Mediate a conflict between friends or family',
  'Attend a local council meeting to support your community'
);

UPDATE good_deeds SET category = 'CONNECT' WHERE deed_text IN (
  'Call a family member you haven''t spoken to in a while',
  'Organize a neighborhood potluck dinner',
  'Host a game night and invite someone new',
  'Introduce two people in your network who could help each other',
  'Send a handwritten card to a friend just because',
  'Spend quality time with a friend without looking at your phone',
  'Write a sincere apology to someone you''ve wronged',
  'Forgive someone you''ve been holding a grudge against',
  'Write a letter to a local representative about a cause you care about'
);

UPDATE good_deeds SET category = 'CELEBRATE' WHERE deed_text IN (
  'Write a heartfelt thank-you note to a mentor',
  'Leave a positive review for a local small business',
  'Write a recommendation letter for a colleague',
  'Give a genuine compliment to your boss or manager',
  'Support a friend''s side hustle or small business',
  'Surprise your partner with a thoughtful date night',
  'Bring homemade treats to your workplace',
  'Send a care package to someone in the military'
);

UPDATE good_deeds SET category = 'ENCOURAGE' WHERE deed_text IN (
  'Mentor a young professional in your field',
  'Tutor a student for free',
  'Teach a free class or workshop in your area of expertise',
  'Offer your professional skills pro bono to a nonprofit',
  'Help a coworker with a project without being asked',
  'Write a recommendation letter for a colleague',
  'Donate books to a local library or Little Free Library',
  'Participate in a charity run or walk'
);

UPDATE good_deeds SET category = 'HELP' WHERE deed_text IN (
  'Donate to a local food bank or shelter',
  'Volunteer for a community cleanup event',
  'Cook a meal for a friend going through a tough time',
  'Drive a neighbor to a medical appointment',
  'Donate blood at your local blood bank',
  'Volunteer at a local animal shelter',
  'Donate professional clothes to a job-readiness program',
  'Donate unused household items to a charity shop',
  'Organize a clothing drive at your workplace',
  'Shovel snow or rake leaves for an elderly neighbor',
  'Offer to babysit for a friend so they can have a night out',
  'Offer to walk a neighbor''s dog',
  'Help a friend move without being asked twice',
  'Prepare a meal for a new parent in your life',
  'Donate to a GoFundMe for someone in need',
  'Set up a recurring donation to a cause you believe in',
  'Sign up as an organ donor',
  'Plant a tree or start a community garden',
  'Spend an afternoon picking up litter in your neighborhood',
  'Bring reusable bags and refuse single-use plastics for a week'
);

UPDATE good_deeds SET category = 'DELIGHT' WHERE deed_text IN (
  'Buy a coffee for the person behind you in line',
  'Leave a generous tip for your server',
  'Pay for a stranger''s groceries',
  'Tip your delivery driver extra generously',
  'Bring flowers to a nursing home',
  'Leave an encouraging note for a stranger to find',
  'Surprise your partner with a thoughtful date night',
  'Bring homemade treats to your workplace'
);

-- Any remaining deeds without a category default to HELP
UPDATE good_deeds SET category = 'HELP' WHERE category NOT IN ('NOTICE','CONNECT','CELEBRATE','ENCOURAGE','HELP','DELIGHT');
