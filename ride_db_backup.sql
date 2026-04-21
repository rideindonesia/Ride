--
-- PostgreSQL database dump
--

\restrict CKwDfZmrjz1AtIEMreJYzAfgP5E4xjdVeAP25YwKhjJOpSmmZ7QY0a2bEJdIuud

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

--
-- Name: mitra_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.mitra_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.mitra_status OWNER TO postgres;

--
-- Name: role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.role AS ENUM (
    'pengguna',
    'mitra'
);


ALTER TYPE public.role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    order_id integer NOT NULL,
    sender_id integer NOT NULL,
    sender_role character varying(20) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chat_messages OWNER TO postgres;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_messages_id_seq OWNER TO postgres;

--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: mitra_applications; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.mitra_applications OWNER TO postgres;

--
-- Name: mitra_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.mitra_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mitra_applications_id_seq OWNER TO postgres;

--
-- Name: mitra_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.mitra_applications_id_seq OWNED BY public.mitra_applications.id;


--
-- Name: mitra_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mitra_locations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    speed_kmh double precision DEFAULT 0,
    is_online boolean DEFAULT false NOT NULL,
    service_type text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mitra_locations OWNER TO postgres;

--
-- Name: mitra_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.mitra_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mitra_locations_id_seq OWNER TO postgres;

--
-- Name: mitra_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.mitra_locations_id_seq OWNED BY public.mitra_locations.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
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
    pengguna_confirmed boolean DEFAULT false NOT NULL,
    tracking_phase character varying(20) DEFAULT 'menuju'::character varying,
    payment_data json,
    total_amount integer,
    platform_fee integer,
    rating real,
    review_comment text,
    is_platform_fee_paid boolean DEFAULT false NOT NULL,
    platform_fee_paid_at timestamp without time zone,
    cancel_reason text,
    canceled_by character varying(20),
    payment_confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    pengguna_photo_path text,
    mitra_proof_photo_path text
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.otp_codes OWNER TO postgres;

--
-- Name: otp_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.otp_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.otp_codes_id_seq OWNER TO postgres;

--
-- Name: otp_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.otp_codes_id_seq OWNED BY public.otp_codes.id;


--
-- Name: platform_fee_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_fee_payments (
    id integer NOT NULL,
    mitra_id integer NOT NULL,
    amount_claimed integer NOT NULL,
    amount_verified integer,
    proof_photo_path text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    verified_at timestamp without time zone,
    verified_by_id integer
);


ALTER TABLE public.platform_fee_payments OWNER TO postgres;

--
-- Name: platform_fee_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platform_fee_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_fee_payments_id_seq OWNER TO postgres;

--
-- Name: platform_fee_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platform_fee_payments_id_seq OWNED BY public.platform_fee_payments.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.push_subscriptions OWNER TO postgres;

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.push_subscriptions_id_seq OWNER TO postgres;

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    user_id integer NOT NULL,
    order_id integer,
    order_no character varying(30),
    type character varying(50) DEFAULT 'general'::character varying NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    admin_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reports_id_seq OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    label text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
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
    is_admin boolean DEFAULT false NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vouchers_id_seq OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: mitra_applications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_applications ALTER COLUMN id SET DEFAULT nextval('public.mitra_applications_id_seq'::regclass);


--
-- Name: mitra_locations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_locations ALTER COLUMN id SET DEFAULT nextval('public.mitra_locations_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: otp_codes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_codes ALTER COLUMN id SET DEFAULT nextval('public.otp_codes_id_seq'::regclass);


--
-- Name: platform_fee_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_fee_payments ALTER COLUMN id SET DEFAULT nextval('public.platform_fee_payments_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_messages (id, order_id, sender_id, sender_role, message, created_at) FROM stdin;
14	20	1	pengguna	Halo	2026-04-21 09:02:12.601805
15	20	1	pengguna	Ok masuk	2026-04-21 09:02:25.563316
16	20	1	pengguna	📋 Rincian Biaya:\n• Biaya Jasa Bengkel: Rp 100.000\n• Biaya Sparepart: Rp 60.000\n• Biaya Panggilan: Rp 33.500\n• Biaya Layanan & Admin: Rp 2.000\n• Total: Rp 195.500\nMetode bayar: CASH	2026-04-21 09:03:06.941181
\.


--
-- Data for Name: mitra_applications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mitra_applications (id, name, phone, email, password_hash, service_type, ktp_path, selfie_ktp_path, sim_path, cert_path, operating_city, status, created_at) FROM stdin;
1	Budi Santoso	+6281234567890	budi.santoso@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	bengkel	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.350122
2	Doni Prasetyo	+6283188889999	doni.prasetyo@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	elektronik	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.366288
3	Wahyu Sanjaya	+6287812345678	wahyu.sanjaya@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	cuci	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.38231
4	Anto Wijaya	+6285211223344	anto.wijaya@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	barber	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.399215
5	Heru Gunawan	+6289934567890	heru.gunawan@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	inspeksi	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.416019
6	Rudi Hermawan	+6282198765432	rudi.hermawan@ride.app	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	towing	\N	\N	\N	\N	Balikpapan	approved	2026-04-21 05:58:15.432679
\.


--
-- Data for Name: mitra_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mitra_locations (id, user_id, lat, lng, speed_kmh, is_online, service_type, updated_at) FROM stdin;
2	4	0	0	0	f	elektronik	2026-04-21 05:58:15.361388
4	6	0	0	0	f	barber	2026-04-21 05:58:15.394044
5	7	0	0	0	f	inspeksi	2026-04-21 05:58:15.409815
6	8	0	0	0	f	towing	2026-04-21 05:58:15.42751
3	5	0	0	0	f	cuci	2026-04-21 07:42:37.04
1	3	-1.2742251	116.8642827	0.19210022538900376	f	bengkel	2026-04-21 12:16:26.456
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, order_no, pengguna_id, mitra_id, service_type, vehicle_type, vehicle_model, vehicle_year, damage_categories, description, pickup_address, detail_alamat, pickup_lat, pickup_lng, status, pengguna_confirmed, tracking_phase, payment_data, total_amount, platform_fee, rating, review_comment, is_platform_fee_paid, platform_fee_paid_at, cancel_reason, canceled_by, payment_confirmed_at, created_at, updated_at, pengguna_photo_path, mitra_proof_photo_path) FROM stdin;
20	ORD62114017I5SF	1	3	bengkel	mobil	Avanza matic	2026	["Mogok Total"]	Mobil rusak parah 	Balikpapan		-1.171936325012715	116.88440566540105	done	t	selesai	{"biayaJasa":100000,"biayaSparepart":60000,"biayaPanggilan":33500,"biayaLayanan":2000,"total":195500,"paymentMethod":"cash","discount":0,"finalTotal":195500}	33500	7025	5	Baik banget	f	\N	\N	\N	2026-04-21 09:03:19.818	2026-04-21 09:01:54.018243	2026-04-21 09:03:26.303	\N	\N
\.


--
-- Data for Name: otp_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.otp_codes (id, phone, code, pending_data, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: platform_fee_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platform_fee_payments (id, mitra_id, amount_claimed, amount_verified, proof_photo_path, status, notes, created_at, verified_at, verified_by_id) FROM stdin;
1	3	7025	\N	/uploads/fee-proofs/fee-1776775697319-jwh5shzeon.jpg	pending	\N	2026-04-21 12:48:18.010204	\N	\N
\.


--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) FROM stdin;
3	1	https://fcm.googleapis.com/fcm/send/test123	BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTMfAAAAAAAAAAAAAAAAAAAAAAA	tBHItJI5svbpez7KI4CCXg	2026-04-21 06:49:51.26766
1	3	https://fcm.googleapis.com/fcm/send/ePTS9_toj_0:APA91bGeRGuYy3qjzb69zomhZOLjwrV5dgZ0Jl9SUyw9N8XLOMmA97wKkMctZ4y-o2FRP-iUCYmXv4oJzSkMeFgaW6wcErBZPaGiFg9iTEAXBYGYE7b0A0xObDIJC3aOTmN8DTVhNbFy	BPRYAuqiKLC7QxvTaMrEIC913WHgGpnaDnWzgF4kHTrkmCPHkdtQaQbDFOW4VGec9m3eDwf3kXMaoRTMtQw72u8	nW0sRle9IvW9g7v1QOMTDw	2026-04-21 05:58:51.23666
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, user_id, order_id, order_no, type, title, message, status, admin_note, created_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (key, value, label, updated_at) FROM stdin;
call_fee_bengkel_base	12000	Bengkel — Biaya Dasar (Rp)	2026-04-21 08:10:20.101749
call_fee_bengkel_per_km	2500	Bengkel — Per Km Lebih (Rp)	2026-04-21 08:10:24.713841
call_fee_barber_base	12000	Barber — Biaya Dasar (Rp)	2026-04-21 08:10:29.189361
call_fee_barber_per_km	2500	Barber — Per Km Lebih (Rp)	2026-04-21 08:10:33.828033
call_fee_cuci_base	12000	Cuci — Biaya Dasar (Rp)	2026-04-21 08:10:38.272976
call_fee_cuci_per_km	2500	Cuci — Per Km Lebih (Rp)	2026-04-21 08:10:42.653652
call_fee_elektronik_base	12000	Elektronik — Biaya Dasar (Rp)	2026-04-21 08:10:47.080565
call_fee_elektronik_per_km	2500	Elektronik — Per Km Lebih (Rp)	2026-04-21 08:10:51.533354
call_fee_inspeksi_base	20000	Inspeksi — Biaya Dasar (Rp)	2026-04-21 08:10:56.332757
call_fee_inspeksi_per_km	3000	Inspeksi — Per Km Lebih (Rp)	2026-04-21 08:11:00.709359
call_fee_towing_base	75000	Towing — Biaya Dasar (Rp)	2026-04-21 08:11:05.38688
call_fee_towing_per_km	8000	Towing — Per Km Lebih (Rp)	2026-04-21 08:11:09.882721
call_fee_free_km	3	Jarak Gratis (km)	2026-04-21 08:11:14.571927
biaya_layanan_admin	2000	Biaya Layanan & Admin (Rp)	2026-04-21 08:11:19.06444
platform_fee_pct	15	platform_fee_pct	2026-04-21 08:05:58.457
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, phone, password_hash, role, profile_photo_path, wallet_balance, is_admin, is_suspended, created_at) FROM stdin;
2	Ahmad Rizki	ahmad.rizki@ride.app	+6281311112222	fcee39bc26f333518183ef76858ea83597a69ff63348068faaa28e8a3cd46c95	pengguna	\N	150000	f	f	2026-04-21 05:58:15.330761
4	Doni Prasetyo	doni.prasetyo@ride.app	+6283188889999	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.355945
5	Wahyu Sanjaya	wahyu.sanjaya@ride.app	+6287812345678	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.372242
6	Anto Wijaya	anto.wijaya@ride.app	+6285211223344	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.388505
7	Heru Gunawan	heru.gunawan@ride.app	+6289934567890	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.404599
8	Rudi Hermawan	rudi.hermawan@ride.app	+6282198765432	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.421065
1	Demo Pengguna	demo.pengguna@ride.app	+6281355446677	fcee39bc26f333518183ef76858ea83597a69ff63348068faaa28e8a3cd46c95	pengguna	\N	150000	f	f	2026-04-21 05:58:15.289767
10	Admin RIDE	admin@ride.app	+6281000000000	69b0dafa76984b60ab7b21424ee8bc39004a13890c78ce8f7abbec910e510aa6	pengguna	\N	0	t	f	2026-04-21 06:57:12.753147
3	Budi Santoso	budi.santoso@ride.app	+6281234567890	5250b120f9c356616fc3d25d0b9306a31baeef522ea3da6a9030747472101870	mitra	\N	0	f	f	2026-04-21 05:58:15.336385
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vouchers (id, code, discount_type, discount_value, min_order, max_discount, usage_limit, usage_count, expires_at, is_active, description, created_at) FROM stdin;
1	RIDE10	percent	10	50000	20000	100	0	2026-12-31 00:00:00	t	Diskon 10% max 20rb	2026-04-21 08:05:58.337742
\.


--
-- Name: chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.chat_messages_id_seq', 16, true);


--
-- Name: mitra_applications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.mitra_applications_id_seq', 6, true);


--
-- Name: mitra_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.mitra_locations_id_seq', 6, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 20, true);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.otp_codes_id_seq', 1, false);


--
-- Name: platform_fee_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.platform_fee_payments_id_seq', 1, true);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.push_subscriptions_id_seq', 29, true);


--
-- Name: reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reports_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 10, true);


--
-- Name: vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vouchers_id_seq', 1, true);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: mitra_applications mitra_applications_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_applications
    ADD CONSTRAINT mitra_applications_email_unique UNIQUE (email);


--
-- Name: mitra_applications mitra_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_applications
    ADD CONSTRAINT mitra_applications_pkey PRIMARY KEY (id);


--
-- Name: mitra_locations mitra_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_locations
    ADD CONSTRAINT mitra_locations_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_no_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_no_unique UNIQUE (order_no);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: platform_fee_payments platform_fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_fee_payments
    ADD CONSTRAINT platform_fee_payments_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_unique UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: chat_messages chat_messages_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: chat_messages chat_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: mitra_locations mitra_locations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mitra_locations
    ADD CONSTRAINT mitra_locations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: orders orders_mitra_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_mitra_id_users_id_fk FOREIGN KEY (mitra_id) REFERENCES public.users(id);


--
-- Name: orders orders_pengguna_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pengguna_id_users_id_fk FOREIGN KEY (pengguna_id) REFERENCES public.users(id);


--
-- Name: platform_fee_payments platform_fee_payments_mitra_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_fee_payments
    ADD CONSTRAINT platform_fee_payments_mitra_id_users_id_fk FOREIGN KEY (mitra_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict CKwDfZmrjz1AtIEMreJYzAfgP5E4xjdVeAP25YwKhjJOpSmmZ7QY0a2bEJdIuud

