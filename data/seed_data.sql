USE `ditrix_scanner`;

-- users
INSERT INTO users (id, email, name, avatar_url, password_hash, verified, created_at, updated_at)
VALUES
  (1, 'owner@example.com', 'Owner User', NULL, 'hash', 1, NOW(), NOW()),
  (2, 'editor@example.com', 'Editor User', NULL, 'hash', 1, NOW(), NOW()),
  (3, 'viewer@example.com', 'Viewer User', NULL, 'hash', 0, NOW(), NOW());

-- sessions (auth sessions)
INSERT INTO sessions (id, token, user_id, date, created_at, updated_at, expires_at)
VALUES
  (1, 'tok-owner', 1, CURDATE(), NOW(), NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY)),
  (2, 'tok-editor', 2, CURDATE(), NOW(), NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY));

-- a capture session (local)
INSERT INTO capture_session (id, user_id, subject, date, start_time, end_time, created_at, updated_at)
VALUES
  ('cs1', 1, 'Intro to Databases', CURDATE(), '09:00:00', '10:00:00', NOW(), NOW());

-- shared capture
INSERT INTO shared_captures (id, capture_id, owner_id, share_code, subject, date, start_time, end_time, created_at, updated_at)
VALUES
  ('sc1', 'sc1', 1, 'CODE123', 'Intro to Databases', CURDATE(), '09:00:00', '10:00:00', NOW(), NOW());

-- roster for shared capture
INSERT INTO capture_roster (capture_id, student_id, student_name, present, time_marked, status)
VALUES
  ('sc1', 's1', 'Alice Student', 1, NOW(), 'present'),
  ('sc1', 's2', 'Bob Student', 0, NULL, 'absent');

-- collaborators for shared capture
INSERT INTO capture_collaborators (capture_id, user_id, role, joined_at)
VALUES
  ('sc1', 2, 'editor', NOW()),
  ('sc1', 3, 'viewer', NOW());