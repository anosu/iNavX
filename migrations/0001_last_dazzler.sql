CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`description` text NOT NULL,
	`suggested_category` text NOT NULL,
	`status` text NOT NULL,
	`review_note` text NOT NULL,
	`site_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_pending_url` ON `applications` (`normalized_url`) WHERE "applications"."status" = 'pending';