CREATE TYPE "public"."role" AS ENUM('pengguna', 'mitra', 'merchant');--> statement-breakpoint
CREATE TYPE "public"."mitra_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"profile_photo_path" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"notif_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"pending_data" jsonb,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mitra_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"service_type" text NOT NULL,
	"ktp_path" text,
	"selfie_ktp_path" text,
	"sim_path" text,
	"cert_path" text,
	"operating_city" text NOT NULL,
	"status" "mitra_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mitra_applications_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "merchant_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"shop_name" text NOT NULL,
	"category" text DEFAULT 'food' NOT NULL,
	"description" text,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"operating_city" text NOT NULL,
	"ktp_path" text,
	"shop_photo_path" text,
	"status" "merchant_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_applications_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "mitra_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" double precision DEFAULT 0,
	"is_online" boolean DEFAULT false NOT NULL,
	"service_type" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" varchar(20) NOT NULL,
	"pengguna_id" integer NOT NULL,
	"mitra_id" integer,
	"service_type" varchar(50) NOT NULL,
	"vehicle_type" varchar(20),
	"vehicle_model" varchar(100),
	"vehicle_year" varchar(4),
	"damage_categories" json,
	"description" text,
	"pickup_address" text,
	"detail_alamat" text,
	"pickup_lat" double precision,
	"pickup_lng" double precision,
	"dest_lat" double precision,
	"dest_lng" double precision,
	"dest_address" text,
	"trip_distance_km" double precision,
	"recipient_name" varchar(120),
	"recipient_phone" varchar(30),
	"item_note" text,
	"merchant_id" integer,
	"order_items" json,
	"food_total" integer,
	"merchant_status" varchar(20),
	"merchant_ready_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"pengguna_confirmed" boolean DEFAULT false NOT NULL,
	"tracking_phase" varchar(20) DEFAULT 'menuju',
	"payment_data" json,
	"total_amount" integer,
	"platform_fee" integer,
	"rating" real,
	"review_comment" text,
	"is_platform_fee_paid" boolean DEFAULT false NOT NULL,
	"platform_fee_paid_at" timestamp,
	"cancel_reason" text,
	"canceled_by" varchar(20),
	"payment_confirmed_at" timestamp,
	"pengguna_photo_path" text,
	"mitra_proof_photo_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_role" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(20) DEFAULT 'percent' NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"category" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"order_no" varchar(30),
	"type" varchar(50) DEFAULT 'general' NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_fee_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"mitra_id" integer NOT NULL,
	"amount_claimed" integer NOT NULL,
	"amount_verified" integer,
	"proof_photo_path" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	"verified_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"pengguna_id" integer NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"pengguna_id" integer NOT NULL,
	"voucher_id" integer,
	"code" text NOT NULL,
	"order_id" integer,
	"order_no" text,
	"discount" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer,
	"name" varchar(160) NOT NULL,
	"category" varchar(30) DEFAULT 'food' NOT NULL,
	"description" text,
	"address" text,
	"phone" varchar(30),
	"lat" double precision,
	"lng" double precision,
	"photo_path" text,
	"is_open" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'approved' NOT NULL,
	"operating_city" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"photo_path" text,
	"category" varchar(60),
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mitra_locations" ADD CONSTRAINT "mitra_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pengguna_id_users_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_mitra_id_users_id_fk" FOREIGN KEY ("mitra_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_payments" ADD CONSTRAINT "platform_fee_payments_mitra_id_users_id_fk" FOREIGN KEY ("mitra_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;