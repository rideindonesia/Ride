--
-- PostgreSQL database dump
--

\restrict V5EUAc1h55MAIRrfTF27bL5IesX2K6qe1y3PGThc1PDeTTP92vcscEhTHQ80TR5

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pengguna_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_mitra_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.mitra_locations DROP CONSTRAINT IF EXISTS mitra_locations_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_order_id_orders_id_fk;
ALTER TABLE IF EXISTS ONLY public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.vouchers DROP CONSTRAINT IF EXISTS vouchers_pkey;
ALTER TABLE IF EXISTS ONLY public.vouchers DROP CONSTRAINT IF EXISTS vouchers_code_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_order_no_unique;
ALTER TABLE IF EXISTS ONLY public.mitra_locations DROP CONSTRAINT IF EXISTS mitra_locations_pkey;
ALTER TABLE IF EXISTS ONLY public.mitra_applications DROP CONSTRAINT IF EXISTS mitra_applications_pkey;
ALTER TABLE IF EXISTS ONLY public.mitra_applications DROP CONSTRAINT IF EXISTS mitra_applications_email_unique;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE IF EXISTS public.wallet_transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.vouchers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.otp_codes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.mitra_locations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.mitra_applications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chat_messages ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.wallet_transactions_id_seq;
DROP TABLE IF EXISTS public.wallet_transactions;
DROP SEQUENCE IF EXISTS public.vouchers_id_seq;
DROP TABLE IF EXISTS public.vouchers;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.system_settings;
DROP SEQUENCE IF EXISTS public.otp_codes_id_seq;
DROP TABLE IF EXISTS public.otp_codes;
DROP SEQUENCE IF EXISTS public.orders_id_seq;
DROP TABLE IF EXISTS public.orders;
DROP SEQUENCE IF EXISTS public.mitra_locations_id_seq;
DROP TABLE IF EXISTS public.mitra_locations;
DROP SEQUENCE IF EXISTS public.mitra_applications_id_seq;
DROP TABLE IF EXISTS public.mitra_applications;
DROP SEQUENCE IF EXISTS public.chat_messages_id_seq;
DROP TABLE IF EXISTS public.chat_messages;
DROP TYPE IF EXISTS public.wallet_tx_type;
DROP TYPE IF EXISTS public.role;
DROP TYPE IF EXISTS public.mitra_status;
--
-- Name: mitra_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mitra_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'pengguna',
    'mitra'
);


--
-- Name: wallet_tx_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_tx_type AS ENUM (
    'topup',
    'payment',
    'refund',
    'withdraw'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    order_id integer NOT NULL,
    sender_id integer NOT NULL,
    sender_role character varying(20) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: mitra_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mitra_applications (
    id integer NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    service_type text NOT NULL,
    ktp_path text,
    selfie_ktp_path text,
    sim_path text,
    cert_path text,
    operating_city text NOT NULL,
    status public.mitra_status DEFAULT 'pending'::public.mitra_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mitra_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mitra_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mitra_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mitra_applications_id_seq OWNED BY public.mitra_applications.id;


--
-- Name: mitra_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mitra_locations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    service_type text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    speed_kmh double precision DEFAULT 0
);


--
-- Name: mitra_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mitra_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mitra_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mitra_locations_id_seq OWNED BY public.mitra_locations.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_no character varying(20) NOT NULL,
    pengguna_id integer NOT NULL,
    mitra_id integer,
    service_type character varying(50) NOT NULL,
    vehicle_type character varying(20),
    vehicle_model character varying(100),
    vehicle_year character varying(4),
    damage_categories json,
    description text,
    pickup_address text,
    detail_alamat text,
    pickup_lat double precision,
    pickup_lng double precision,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    tracking_phase character varying(20) DEFAULT 'menuju'::character varying,
    payment_data json,
    total_amount integer,
    platform_fee integer,
    rating real,
    review_comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    pengguna_confirmed boolean DEFAULT false NOT NULL,
    is_platform_fee_paid boolean DEFAULT false NOT NULL,
    platform_fee_paid_at timestamp without time zone
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id integer NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    pending_data jsonb,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otp_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otp_codes_id_seq OWNED BY public.otp_codes.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    label text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    role public.role NOT NULL,
    profile_photo_path text,
    wallet_balance integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    discount_type character varying(20) DEFAULT 'percent'::character varying NOT NULL,
    discount_value integer NOT NULL,
    min_order integer DEFAULT 0 NOT NULL,
    max_discount integer,
    usage_limit integer,
    usage_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    description character varying(200),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type public.wallet_tx_type NOT NULL,
    amount integer NOT NULL,
    description text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: mitra_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_applications ALTER COLUMN id SET DEFAULT nextval('public.mitra_applications_id_seq'::regclass);


--
-- Name: mitra_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_locations ALTER COLUMN id SET DEFAULT nextval('public.mitra_locations_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: otp_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes ALTER COLUMN id SET DEFAULT nextval('public.otp_codes_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_messages (id, order_id, sender_id, sender_role, message, created_at) FROM stdin;
\.


--
-- Data for Name: mitra_applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mitra_applications (id, name, phone, email, password_hash, service_type, ktp_path, selfie_ktp_path, sim_path, cert_path, operating_city, status, created_at) FROM stdin;
1	Budi Santoso	+6281234567890	budi.santoso@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	bengkel	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.484421
2	Doni Prasetyo	+6283188889999	doni.prasetyo@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	elektronik	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.496091
3	Wahyu Sanjaya	+6287812345678	wahyu.sanjaya@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	cuci	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.505502
4	Anto Wijaya	+6285211223344	anto.wijaya@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	barber	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.515131
5	Heru Gunawan	+6289934567890	heru.gunawan@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	inspeksi	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.528968
6	Rudi Hermawan	+6282198765432	rudi.hermawan@ride.app	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	towing	\N	\N	\N	\N	Balikpapan	approved	2026-04-16 05:48:36.538591
\.


--
-- Data for Name: mitra_locations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mitra_locations (id, user_id, lat, lng, is_online, service_type, updated_at, speed_kmh) FROM stdin;
2	4	-1.2704	116.8402	t	elektronik	2026-04-16 05:48:36.492682	0
3	5	-1.2504	116.8212	t	cuci	2026-04-16 05:48:36.502458	0
4	6	-1.2754	116.8312	t	barber	2026-04-16 05:48:36.511621	0
5	7	-1.2654	116.8452	t	inspeksi	2026-04-16 05:48:36.52273	0
6	8	-1.2554	116.8482	t	towing	2026-04-16 05:48:36.535746	0
1	3	-1.2742385	116.8643147	t	bengkel	2026-04-17 09:12:19.149	0.07800750955939294
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_no, pengguna_id, mitra_id, service_type, vehicle_type, vehicle_model, vehicle_year, damage_categories, description, pickup_address, detail_alamat, pickup_lat, pickup_lng, status, tracking_phase, payment_data, total_amount, platform_fee, rating, review_comment, created_at, updated_at, pengguna_confirmed, is_platform_fee_paid, platform_fee_paid_at) FROM stdin;
\.


--
-- Data for Name: otp_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otp_codes (id, phone, code, pending_data, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_settings (key, value, label, updated_at) FROM stdin;
call_fee_bengkel_base	12000	Bengkel — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_bengkel_per_km	2500	Bengkel — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_barber_base	12000	Barber — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_barber_per_km	2500	Barber — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_cuci_base	12000	Cuci — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_cuci_per_km	2500	Cuci — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_elektronik_base	12000	Elektronik — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_elektronik_per_km	2500	Elektronik — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_inspeksi_base	20000	Inspeksi — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_inspeksi_per_km	3000	Inspeksi — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_towing_base	75000	Towing — Biaya Dasar (Rp)	2026-04-17 01:21:54.870634
call_fee_towing_per_km	8000	Towing — Per Km Lebih (Rp)	2026-04-17 01:21:54.870634
call_fee_free_km	3	Jarak Gratis (km, berlaku semua layanan)	2026-04-17 01:21:54.870634
biaya_layanan_admin	2000	Biaya Layanan & Admin (Rp, dibayar user)	2026-04-17 01:21:54.870634
platform_fee_pct	15	Platform Fee Mitra (% dari Biaya Panggilan)	2026-04-17 01:21:54.870634
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, phone, password_hash, role, profile_photo_path, wallet_balance, created_at, is_admin, is_suspended) FROM stdin;
1	Demo Pengguna	demo.pengguna@ride.app	+6281355446677	8915f56ad8a450ac7e5de9e14616437987b4bfb4a1f3a5b16795724ecc87153a	pengguna	\N	150000	2026-04-16 05:48:36.467658	f	f
2	Ahmad Rizki	ahmad.rizki@ride.app	+6281311112222	8915f56ad8a450ac7e5de9e14616437987b4bfb4a1f3a5b16795724ecc87153a	pengguna	\N	150000	2026-04-16 05:48:36.47254	f	f
3	Budi Santoso	budi.santoso@ride.app	+6281234567890	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.476603	f	f
4	Doni Prasetyo	doni.prasetyo@ride.app	+6283188889999	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.48881	f	f
5	Wahyu Sanjaya	wahyu.sanjaya@ride.app	+6287812345678	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.49925	f	f
6	Anto Wijaya	anto.wijaya@ride.app	+6285211223344	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.508305	f	f
7	Heru Gunawan	heru.gunawan@ride.app	+6289934567890	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.51938	f	f
8	Rudi Hermawan	rudi.hermawan@ride.app	+6282198765432	fb594fd187cbf4e8d660c3d21f136a39a62c2ea1f73a04e016b4b5c7f5e1142b	mitra	\N	0	2026-04-16 05:48:36.532534	f	f
9	Super Admin	admin@ride.app	\N	731889ce8acd1da878c1dac5dab4b1f3fa5342c83121d9da1c771a7f8c63df1d	pengguna	\N	0	2026-04-17 01:32:27.459431	t	f
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vouchers (id, code, discount_type, discount_value, min_order, max_discount, usage_limit, usage_count, expires_at, is_active, description, created_at) FROM stdin;
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.wallet_transactions (id, user_id, type, amount, description, created_at) FROM stdin;
\.


--
-- Name: chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_messages_id_seq', 62, true);


--
-- Name: mitra_applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mitra_applications_id_seq', 6, true);


--
-- Name: mitra_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mitra_locations_id_seq', 6, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.otp_codes_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 9, true);


--
-- Name: vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vouchers_id_seq', 1, false);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_transactions_id_seq', 1, false);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: mitra_applications mitra_applications_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_applications
    ADD CONSTRAINT mitra_applications_email_unique UNIQUE (email);


--
-- Name: mitra_applications mitra_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_applications
    ADD CONSTRAINT mitra_applications_pkey PRIMARY KEY (id);


--
-- Name: mitra_locations mitra_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_locations
    ADD CONSTRAINT mitra_locations_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_no_unique UNIQUE (order_no);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_unique UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: chat_messages chat_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: mitra_locations mitra_locations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra_locations
    ADD CONSTRAINT mitra_locations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: orders orders_mitra_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_mitra_id_users_id_fk FOREIGN KEY (mitra_id) REFERENCES public.users(id);


--
-- Name: orders orders_pengguna_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pengguna_id_users_id_fk FOREIGN KEY (pengguna_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict V5EUAc1h55MAIRrfTF27bL5IesX2K6qe1y3PGThc1PDeTTP92vcscEhTHQ80TR5

