import type { Locale } from "@/lib/currency";

const en = {
  meta: {
    title: "VLABS | Science Practice Across Subjects",
    description:
      "Meet VLABS, a science practice platform for physics, chemistry, biology and mathematics. Explore classroom questions with guidance from your teacher.",
  },

  seo: {
    pricingMarkdown: "Read pricing as Markdown",
  },

  common: {
    skip: "Skip to Main Content",
    mainNavigation: "Main Navigation",
    menu: "Menu",
    languageSelector: "Language and currency: English, USD",
    languageHelp:
      "Your language selection also determines the displayed currency. When browser storage is available, VLABS remembers your choice. If storage is unavailable, supported links carry your selection through the lang parameter. A later visit without that parameter may use the default language and currency for your location.",
    darkMode: "Dark mode",
    switchLight: "Switch to light mode",
    switchDark: "Switch to dark mode",
    home: "VLABS Home",
    social: "VLABS Social Channels",
    newTab: "opens in a new tab",
    footerNavigation: "Footer Navigation",
    footerTagline:
      "Hands-on learning across the sciences, where students can observe, experiment, and gradually discover answers for themselves. VLABS makes complex concepts more visual and easier to understand, while helping teachers organise learning and guide every student along the way.",
    copyright: "&copy; 2026 Smart Learning Technology Solution. All Rights Reserved.",
    requestDemo: "Request a Demo",
    contactTeam: "Talk With VLABS",
    privacy: "Privacy Policy",
    terms: "Terms and Conditions",
    openPreview: "View screenshot larger",
    closePreview: "Close image preview",
  },

  alt: {
    home: "VLABS science learning overview",
    features: "VLABS tools for science practice",
    business: "VLABS classroom workspace",
    platform: "VLABS learning tools accompanying this activity",
    about: "Image accompanying the VLABS project introduction",
    caseStudy: "Illustration for a proposed teaching and practice scenario",
    story: "Image accompanying the VLABS project story",
  },

  screenshots: {
    circuit: {
      alt: "Vietnamese-language VLABS Ohm's law demo with a 3D circuit, guided steps, prediction questions and formulas",
      caption:
        "Look beside the 3D circuit for guided steps and prediction questions in the VLABS Ohm's law demo. Interface shown in Vietnamese.",
    },
    projectile: {
      alt: "Vietnamese-language VLABS 3D projectile-motion demo with investigation steps, prediction questions and formulas in its initial paused state",
      caption:
        "A closer look at the 3D projectile-motion demo, with investigation prompts and formulas beside the scene. Captured in its initial paused state; interface shown in Vietnamese.",
    },
    catalog: {
      alt: "Vietnamese-language VLABS physics demo catalog showing Mechanics and Electricity categories and 2D and 3D experiments",
      caption:
        "The demo's physics catalog groups activities under Mechanics and Electricity. Interface shown in Vietnamese.",
    },
    student: {
      alt: "Vietnamese-language VLABS student demo dashboard with featured physics experiments, recent activity and sample practice totals",
      caption:
        "A student's starting point in the Vietnamese-language demo. Activity figures are sample data.",
    },
    progress: {
      alt: "Vietnamese-language VLABS student progress demo with sample activity totals and empty competence and graded-work areas",
      caption:
        "A closer look at the student progress demo, shown in Vietnamese. Figures are sample data; competence and graded-work areas are empty.",
    },
    teacher: {
      alt: "Vietnamese-language VLABS teacher demo dashboard with sample class figures and empty assigned-lesson and marking areas",
      caption:
        "A teacher's view of the Vietnamese-language demo. Class figures are sample data; assigned-lesson and marking areas are empty.",
    },
    roleStudent: {
      alt: "Vietnamese-language VLABS student demo home with sample lab totals, learning streak and practice hours, featured physics labs and recent activity",
      caption:
        "The student demo home brings featured physics labs, recent activity and practice totals together. Interface shown in Vietnamese; figures are sample data and names are masked.",
    },
    roleTeacher: {
      alt: "Vietnamese-language VLABS teacher demo home with a sample class summary, a Create Lab button and empty marking and assigned-lesson areas",
      caption:
        "The teacher demo home shows a class summary and a Create Lab button; marking and assigned-lesson areas are empty. Interface shown in Vietnamese; figures are sample data and names are masked.",
    },
    roleAdministrator: {
      alt: "Vietnamese-language VLABS administrator demo overview with sample user, lesson, submission and activity totals, a user-role chart and lesson status",
      caption:
        "The administrator demo overview shows user roles, lesson status and an activity chart. Interface shown in Vietnamese; figures are sample data and names are masked.",
    },
  },

  contact: {
    team: "Let's Talk About Your Class",
    notice:
      "Your enquiry starts a conversation. Demo timing and any classroom use are agreed separately; sending this form does not create a learning account.",
    enquiry: "What Is Your Class Asking?",
    help: "Tell us what you teach, who is learning and what they are curious about. Mention the devices you use and a time that suits you for a demo conversation.",
    submit: "Start the Conversation",
  },

  integrations: {
    title: "Let's Talk About Your Classroom Tools",
    notice:
      "These are planning topics, not ready-to-use connectors. Confirm provider compatibility, data permissions, security requirements and delivery scope with the VLABS team before sharing institutional information.",
  },

  caseStudy: {
    indexTitle: "Learning Workflows in Practice",
    indexNotice:
      "Explore illustrative scenarios showing how VLABS could support lesson preparation, virtual experiments, practical activities, formative assessment, learning evidence, and timely learner support. These scenarios describe proposed workflows. They are not verified customer deployments, independent evaluations, or measured performance outcomes.",
    empty:
      "No illustrative learning workflows are currently published. Contact the VLABS team to discuss your teaching context, practical requirements, and the type of workflow you would like to evaluate.",
    noticeTitle: "Illustrative Learning Scenario",
    notice:
      "This scenario presents a possible use of VLABS based on the platform development proposal. It is not a verified customer case study and does not claim a measured improvement in learning outcomes. Any expected benefit should be tested through an agreed pilot with defined participants, objectives, duration, evidence, and evaluation criteria.",
    explore: "Explore This Workflow",
    back: "View All Workflows",
  },

  careers: {
    statusTitle: "Ways to Contribute to VLABS",
    status:
      "The profiles below introduce areas in which educators, researchers, designers, developers, and other specialists may contribute to the development of VLABS. Unless a profile is specifically marked as open, it does not represent a confirmed vacancy, employment offer, internship, or paid engagement. Contact our team for current information.",
    empty:
      "No role profiles are currently published. You are still welcome to contact the VLABS team to introduce your experience and ask about future opportunities to contribute.",
    questionsTitle: "Explore Opportunities With Us",
    questions:
      "Ask about current roles, expected responsibilities, required experience, location, working arrangements, selection stages, compensation information, and the application process. Please confirm how applicant information is handled before sending identification documents, certificates, financial information, or other sensitive records.",
    email: "Contact the VLABS Team",
    emailSubject: "VLABS Careers Enquiry",
    cardLabel: "Potential Area of Contribution",
    area: "Area of work",
    view: "Explore This Role",
    noticeTitle: "Illustrative Profile, Not a Confirmed Vacancy",
    notice:
      "This profile introduces a possible area of contribution to VLABS. It does not confirm an open position, salary, working location, contract type, employment conditions, benefits, recruitment timeline, or selection outcome.",
    confirmTitle: "Request Current Recruitment Information",
    confirm:
      "Contact the VLABS team to request a confirmed role description, eligibility requirements, working arrangements, application deadline, data-handling information, and selection process before submitting personal documents.",
    back: "View All Role Profiles",
  },

  notFound: {
    title: "We Could Not Find This Page",
    description:
      "The page may have moved, the address may be incomplete, or the content may no longer be available. Check the link, use the main navigation, or return to the VLABS homepage.",
    back: "Return to the Homepage",
  },

  pricing: {
    billing: "Choose a Billing Interval",
    month: "acc/month",
    year: "acc/year",
    monthlyNote:
      "Pay monthly in USD through PayPal. Unless stated otherwise during checkout, the subscription renews automatically each month until it is cancelled under the applicable subscription terms.",
    yearlyNote:
      "Pay yearly in USD through PayPal. The full annual amount is charged once per year. Unless stated otherwise during checkout, the subscription renews automatically each year until it is cancelled under the applicable subscription terms.",
    noScript:
      "Monthly reference prices are currently displayed. Enable JavaScript to compare annual pricing, update the selected plan, or open checkout.",
    availability:
      "Published plans are provided as reference options and do not guarantee that every listed function is released, enabled, or available in every country, language, device environment, or organisation. Before purchasing, confirm feature availability, learner and administrator limits, storage, supported SSO providers, onboarding, training, custom work, technical support, taxes, payment readiness, data requirements, and implementation responsibilities with the VLABS team. Payment alone does not automatically create or activate a VLABS learning account on this website.",
    fixedRate:
      "USD prices are billed in USD and VND prices are billed in VND as listed. Prices are set independently and are not converted from one currency to the other. The displayed language and currency change together.",
    published: "Published Reference Features",
    included: "Included",
    notIncluded: "Not included",
    noCheckout:
      "JavaScript is required to prepare and open the checkout process.",
    instead: "instead.",
    comparison: "Compare VLABS Plans",
    caption:
      "Comparison of published VLABS reference plans, features, and monthly or yearly prices",
    comparisonNote:
      "Before purchasing, confirm released features, learner limits, administrator access, supported SSO providers, onboarding scope, technical support, cancellation conditions, refund conditions, applicable taxes, and checkout availability. Prices are displayed in USD. PayPal subscriptions renew automatically according to the monthly or yearly interval shown during checkout unless cancelled under the applicable subscription terms.",
  },

  form: {
    allRequired: "Please complete all required fields.",
    name: "Full Name",
    email: "Email Address",
    phone: "Phone Number",
    message: "How Can VLABS Support You?",
    phoneHelp:
      "Include your country code so our team can contact you more easily.",
    messageHelp:
      "Tell us about your learning goals, priority subjects, intended learner groups, current challenges, expected number of users, and proposed pilot. Please keep your message within 5,000 characters.",
    privacy:
      "Your information is sent to our contact-management service so the VLABS team can review and respond to your enquiry. Please do not include student records, passwords, payment-card details, health information, identification documents, or other sensitive information. Read our",
    privacyLink: "Privacy Policy",
    preferEmail: "Prefer to contact us directly by email?",
    requiredName: "Please enter your full name.",
    requiredEmail: "Please enter your email address.",
    invalidEmail: "Please enter a valid email address.",
    requiredPhone: "Please enter your phone number.",
    requiredMessage:
      "Please tell us a little about your requirements and how we can help.",
    tooLong:
      "Please shorten this entry so it remains within the permitted character limit.",
    required: "Please complete this field.",
    review: "Please review the highlighted fields before sending your enquiry.",
    sending: "Sending…",
    pending:
      "Your enquiry is being sent. Please keep this page open for a moment.",
    submit: "Send Your Enquiry",
    failed:
      "We could not send your enquiry at this time. Please review the information provided and try again.",
    failureHelp:
      "If the problem continues, you can contact the VLABS team directly by email using the address shown below.",
    contactReceived:
      "Thank you. We have received your enquiry. The VLABS team can review your message and follow up using the contact details you provided.",
    leadReceived:
      "Thank you for your interest in VLABS. We have received your request for a product discussion. Our team can contact you using the details provided to explore an appropriate next step.",
    timeout:
      "We could not confirm your request within the expected time. Please try again or contact the VLABS team directly by email.",
    connection:
      "We could not complete your request. Check your internet connection and try again, or contact the VLABS team directly by email.",
  },

  checkout: {
    title: "Checkout for {plan}",
    close: "Close Checkout",
    monthlySummary:
      "{amount} USD per month, billed through PayPal. Unless stated otherwise during checkout, the subscription renews automatically each month until it is cancelled under the applicable subscription terms.",
    yearlySummary:
      "{amount} USD per year, billed through PayPal. The full annual amount is charged once per year. Unless stated otherwise during checkout, the subscription renews automatically each year until it is cancelled under the applicable subscription terms.",
    terms:
      "Please confirm that checkout is available and that the selected plan is suitable before making a payment. Account access, onboarding, service start date, renewal, cancellation, refunds, taxes, support, and implementation responsibilities should be reviewed with the VLABS team. Payment alone does not automatically create or activate a learning account on this website. A browser return page or return URL is not, by itself, proof of successful payment.",
    allRequired: "Please complete all required fields.",
    name: "Full Name",
    email: "Email Address",
    requiredName: "Please enter your full name.",
    requiredEmail: "Please enter your email address.",
    invalidEmail: "Please enter a valid email address.",
    tooLong:
      "Please shorten this entry so it remains within the permitted character limit.",
    review:
      "Please review the highlighted fields before continuing to checkout.",
    privacy:
      "Your name, email address, and selected plan are sent to the website server to prepare a checkout request. Before paying, confirm the payment provider, payment recipient, amount, currency, plan, and applicable data-handling terms. Read our",
    privacyLink: "Privacy Policy",
    termsLink: "Terms and Conditions",
    and: "and",
    loading: "Preparing Checkout…",
    continue: "Continue to PayPal",
    pending: "PayPal checkout is being prepared. Please keep this page open.",
    contact: "Contact the VLABS Team",
    unavailable:
      "Online payment is not available for this selection. Please contact the VLABS team.",
    unavailableContact: "Contact VLABS About Payment",
    retry: "Please try again or contact our team for assistance.",
    failed:
      "Checkout could not be opened. Please try again or contact the VLABS team for assistance.",
    invalidLink:
      "We could not verify the checkout link. Please contact the VLABS team before entering payment information or completing a payment.",
    timeout:
      "Checkout did not respond within the expected time. Please try again or contact the VLABS team.",
    connection:
      "Checkout could not be opened. Check your internet connection and try again.",
  },
};

const vi: typeof en = {
  meta: {
    title: "VLABS | Thực hành cho mọi môn khoa học",
    description:
      "VLABS là nền tảng thực hành cho Vật lí, Hóa học, Sinh học, Toán học và các môn khoa học khác. Mang theo câu hỏi và cùng thầy cô khám phá.",
  },

  seo: {
    pricingMarkdown: "Đọc bảng giá dạng Markdown",
  },

  common: {
    skip: "Chuyển đến nội dung chính",
    mainNavigation: "Điều hướng chính",
    menu: "Trình đơn",
    languageSelector: "Ngôn ngữ và tiền tệ: Tiếng Việt, VND",
    languageHelp:
      "Ngôn ngữ được chọn cũng quyết định đơn vị tiền tệ hiển thị. Khi trình duyệt cho phép lưu trữ, VLABS sẽ ghi nhớ lựa chọn của bạn. Nếu không thể lưu lựa chọn, các liên kết được hỗ trợ sẽ giữ ngôn ngữ qua tham số lang. Trong lần truy cập sau không có tham số này, website có thể sử dụng ngôn ngữ và tiền tệ mặc định theo khu vực.",
    darkMode: "Chế độ tối",
    switchLight: "Chuyển sang chế độ sáng",
    switchDark: "Chuyển sang chế độ tối",
    home: "Trang chủ VLABS",
    social: "Các kênh mạng xã hội của VLABS",
    newTab: "mở trong thẻ mới",
    footerNavigation: "Điều hướng chân trang",
    footerTagline: "Thực hành cho mọi môn khoa học, nơi học sinh được quan sát, thử nghiệm và từng bước tìm ra câu trả lời. VLABS giúp kiến thức trở nên trực quan, dễ hiểu hơn, đồng thời hỗ trợ thầy cô tổ chức bài học và đồng hành cùng người học.",
    copyright: "&copy; 2026 Smart Learning Technology Solution. Bảo lưu mọi quyền.",
    requestDemo: "Yêu cầu demo",
    contactTeam: "Trò chuyện cùng VLABS",
    privacy: "Chính sách quyền riêng tư",
    terms: "Điều khoản và điều kiện",
    openPreview: "Xem ảnh màn hình lớn hơn",
    closePreview: "Đóng ảnh xem trước",
  },

  alt: {
    home: "Tổng quan học tập khoa học VLABS",
    features: "Công cụ VLABS dành cho thực hành khoa học",
    business: "Không gian lớp học VLABS",
    platform: "Công cụ học tập VLABS đi kèm hoạt động này",
    about: "Hình ảnh đi kèm phần giới thiệu dự án VLABS",
    caseStudy: "Hình minh họa cho tình huống dạy học và thực hành được đề xuất",
    story: "Hình ảnh đi kèm câu chuyện dự án VLABS",
  },

  screenshots: {
    circuit: {
      alt: "Demo VLABS giao diện tiếng Việt về định luật Ohm, với mạch điện 3D, hướng dẫn, câu hỏi dự đoán và công thức",
      caption:
        "Nhìn bên cạnh mạch điện 3D để xem hướng dẫn và câu hỏi dự đoán trong demo định luật Ohm VLABS. Giao diện tiếng Việt.",
    },
    projectile: {
      alt: "Demo VLABS giao diện tiếng Việt về chuyển động ném 3D, với hướng dẫn tìm hiểu, câu hỏi dự đoán và công thức ở trạng thái đầu đang tạm dừng",
      caption:
        "Nhìn gần hơn demo chuyển động ném 3D, với câu hỏi tìm hiểu và công thức bên cạnh. Ảnh chụp trạng thái đầu đang tạm dừng; giao diện tiếng Việt.",
    },
    catalog: {
      alt: "Danh mục demo Vật lí VLABS giao diện tiếng Việt, với nhóm Cơ học, Điện học và thí nghiệm 2D, 3D",
      caption:
        "Danh mục Vật lí trong demo chia hoạt động theo nhóm Cơ học và Điện học. Giao diện tiếng Việt.",
    },
    student: {
      alt: "Trang chủ demo học sinh VLABS giao diện tiếng Việt, với thí nghiệm Vật lí nổi bật, hoạt động gần đây và số liệu luyện tập mẫu",
      caption:
        "Điểm bắt đầu của học sinh trong demo giao diện tiếng Việt. Số liệu hoạt động là dữ liệu mẫu.",
    },
    progress: {
      alt: "Demo tiến độ học sinh VLABS giao diện tiếng Việt, với số liệu hoạt động mẫu và mục năng lực, bài đã chấm đang trống",
      caption:
        "Nhìn gần hơn demo tiến độ học sinh, giao diện tiếng Việt. Số liệu là dữ liệu mẫu; mục năng lực và bài đã chấm đang trống.",
    },
    teacher: {
      alt: "Trang chủ demo giáo viên VLABS giao diện tiếng Việt, với số liệu lớp mẫu, mục bài giảng được phân công và hàng chờ chấm đang trống",
      caption:
        "Góc nhìn của giáo viên trong demo giao diện tiếng Việt. Số liệu lớp là dữ liệu mẫu; mục bài giảng được phân công và hàng chờ chấm đang trống.",
    },
    roleStudent: {
      alt: "Trang chủ demo học sinh VLABS giao diện tiếng Việt, với số liệu mẫu về lab đã làm, chuỗi ngày học, giờ thực hành, thí nghiệm Vật lí nổi bật và hoạt động gần đây",
      caption:
        "Trang chủ demo học sinh tập hợp thí nghiệm Vật lí nổi bật, hoạt động gần đây và số liệu luyện tập. Giao diện tiếng Việt; số liệu là dữ liệu mẫu, tên đã được che.",
    },
    roleTeacher: {
      alt: "Trang chủ demo giáo viên VLABS giao diện tiếng Việt, với thông tin lớp mẫu, nút tạo bài Lab, hàng chờ chấm và mục bài giảng được phân công đang trống",
      caption:
        "Trang chủ demo giáo viên có thông tin lớp và nút tạo bài Lab; hàng chờ chấm và mục bài giảng được phân công đang trống. Giao diện tiếng Việt; số liệu là dữ liệu mẫu, tên đã được che.",
    },
    roleAdministrator: {
      alt: "Tổng quan hệ thống demo quản trị viên VLABS giao diện tiếng Việt, với số liệu mẫu về người dùng, bài giảng, bài nộp và hoạt động, biểu đồ vai trò và trạng thái bài giảng",
      caption:
        "Tổng quan demo quản trị viên hiển thị phân bố vai trò người dùng, trạng thái bài giảng và biểu đồ hoạt động. Giao diện tiếng Việt; số liệu là dữ liệu mẫu, tên đã được che.",
    },
  },

  contact: {
    team: "Cùng trò chuyện về lớp của bạn",
    notice:
      "Yêu cầu của bạn mở đầu cuộc trao đổi. Lịch demo và việc sử dụng trong lớp được thống nhất riêng; gửi biểu mẫu này không tạo tài khoản học tập.",
    enquiry: "Lớp bạn đang hỏi gì?",
    help: "Chia sẻ môn bạn dạy, nhóm học sinh và điều các em đang tò mò. Cho chúng tôi biết thiết bị đang dùng và thời gian thuận tiện để trao đổi về demo.",
    submit: "Bắt đầu cuộc trao đổi",
  },

  integrations: {
    title: "Cùng trao đổi về công cụ của lớp",
    notice:
      "Đây là các chủ đề lập kế hoạch, chưa phải bộ kết nối sẵn dùng. Xác nhận khả năng tương thích, quyền dữ liệu, yêu cầu bảo mật và phạm vi thực hiện với VLABS trước khi chia sẻ thông tin của đơn vị.",
  },

  caseStudy: {
    indexTitle: "Quy trình học tập trong thực tiễn",
    indexNotice:
      "Khám phá các tình huống minh họa cách VLABS có thể hỗ trợ chuẩn bị bài học, thí nghiệm ảo, hoạt động thực hành, đánh giá thường xuyên, thu thập minh chứng và hỗ trợ người học đúng thời điểm. Đây là những quy trình được đề xuất, không phải triển khai khách hàng đã được xác minh, đánh giá độc lập hay kết quả cải thiện đã được đo lường.",
    empty:
      "Hiện chưa có quy trình học tập minh họa được công bố. Hãy liên hệ với đội ngũ VLABS để trao đổi về bối cảnh giảng dạy, yêu cầu thực hành và quy trình mà đơn vị của bạn muốn thử nghiệm.",
    noticeTitle: "Tình huống học tập minh họa",
    notice:
      "Tình huống này mô tả một cách ứng dụng VLABS dựa trên định hướng phát triển của nền tảng. Đây không phải trường hợp khách hàng đã triển khai được xác minh và không khẳng định kết quả cải thiện đã được đo lường. Mọi lợi ích kỳ vọng cần được kiểm chứng thông qua chương trình thử nghiệm có phạm vi, nhóm tham gia, thời gian, minh chứng và tiêu chí đánh giá rõ ràng.",
    explore: "Khám phá quy trình",
    back: "Xem tất cả quy trình",
  },

  careers: {
    statusTitle: "Cùng đóng góp cho hành trình VLABS",
    status:
      "Các hồ sơ bên dưới giới thiệu những lĩnh vực mà giáo viên, chuyên gia giáo dục, nhà nghiên cứu, nhà thiết kế, lập trình viên và các chuyên gia khác có thể đóng góp cho quá trình phát triển VLABS. Trừ khi hồ sơ được ghi rõ là đang tuyển, nội dung không đại diện cho vị trí tuyển dụng, lời mời làm việc, chương trình thực tập hay công việc có trả phí đã được xác nhận. Hãy liên hệ với đội ngũ VLABS để nhận thông tin hiện tại.",
    empty:
      "Hiện chưa có hồ sơ vị trí nào được công bố. Bạn vẫn có thể liên hệ với đội ngũ VLABS để giới thiệu kinh nghiệm và tìm hiểu những cơ hội đóng góp trong tương lai.",
    questionsTitle: "Khám phá cơ hội đồng hành",
    questions:
      "Bạn có thể trao đổi với chúng tôi về vị trí hiện có, phạm vi trách nhiệm, yêu cầu kinh nghiệm, địa điểm, hình thức làm việc, các vòng lựa chọn, thông tin thu nhập và quy trình ứng tuyển. Vui lòng xác nhận cách xử lý dữ liệu ứng viên trước khi gửi giấy tờ định danh, chứng chỉ, thông tin tài chính hoặc tài liệu nhạy cảm.",
    email: "Liên hệ đội ngũ VLABS",
    emailSubject: "VLABS - Trao đổi về cơ hội nghề nghiệp",
    cardLabel: "Lĩnh vực có thể đóng góp",
    area: "Lĩnh vực công việc",
    view: "Tìm hiểu vị trí",
    noticeTitle: "Hồ sơ minh họa, không phải vị trí đã xác nhận",
    notice:
      "Hồ sơ này giới thiệu một lĩnh vực có thể đóng góp cho VLABS. Nội dung không xác nhận vị trí đang tuyển, mức lương, địa điểm làm việc, loại hợp đồng, điều kiện tuyển dụng, phúc lợi, thời gian tuyển dụng hay kết quả lựa chọn.",
    confirmTitle: "Yêu cầu thông tin tuyển dụng hiện tại",
    confirm:
      "Hãy liên hệ với đội ngũ VLABS để nhận mô tả vị trí, yêu cầu ứng tuyển, hình thức làm việc, thời hạn nộp hồ sơ, thông tin xử lý dữ liệu và quy trình lựa chọn đã được xác nhận trước khi gửi tài liệu cá nhân.",
    back: "Xem tất cả hồ sơ vị trí",
  },

  notFound: {
    title: "Không tìm thấy trang này",
    description:
      "Trang có thể đã được di chuyển, đường dẫn chưa đầy đủ hoặc nội dung không còn khả dụng. Hãy kiểm tra lại địa chỉ, sử dụng trình đơn chính hoặc trở về trang chủ VLABS.",
    back: "Trở về trang chủ",
  },

  pricing: {
    billing: "Lựa chọn chu kỳ thanh toán",
    month: "tài khoản/tháng",
    year: "tài khoản/năm",
    monthlyNote:
      "Thanh toán trước một lần bằng VND qua SePay cho kỳ sử dụng một tháng. Khi hết kỳ, bạn có thể chủ động lựa chọn gia hạn. Hệ thống không tự động thu tiền cho kỳ tiếp theo.",
    yearlyNote:
      "Thanh toán trước toàn bộ số tiền bằng VND qua SePay cho kỳ sử dụng một năm. Khi hết kỳ, bạn có thể chủ động lựa chọn gia hạn. Hệ thống không tự động thu tiền cho kỳ tiếp theo.",
    noScript:
      "Giá tham khảo theo tháng đang được hiển thị. Hãy bật JavaScript để so sánh giá theo năm, thay đổi gói được chọn hoặc mở quy trình thanh toán.",
    availability:
      "Các gói được công bố là phương án tham khảo và không bảo đảm mọi tính năng đều đã phát hành, được bật hoặc khả dụng tại mọi khu vực, ngôn ngữ, thiết bị hay cơ sở giáo dục. Trước khi mua, vui lòng xác nhận với đội ngũ VLABS về tính năng, giới hạn học sinh và quản trị viên, dung lượng lưu trữ, đơn vị SSO được hỗ trợ, hướng dẫn triển khai, đào tạo, tùy chỉnh, hỗ trợ kỹ thuật, thuế, trạng thái thanh toán, yêu cầu dữ liệu và trách nhiệm của các bên. Việc thanh toán không tự động tạo hoặc kích hoạt tài khoản học tập VLABS trên website này.",
    fixedRate:
      "Giá USD được thanh toán bằng USD và giá VND được thanh toán bằng VND theo mức niêm yết. Giá của hai đơn vị tiền tệ được xác định độc lập, không quy đổi từ đơn vị này sang đơn vị kia. Ngôn ngữ và đơn vị tiền tệ hiển thị được thay đổi cùng nhau.",
    published: "Các tính năng tham khảo được công bố",
    included: "Được bao gồm",
    notIncluded: "Chưa bao gồm",
    noCheckout: "Cần bật JavaScript để chuẩn bị và mở quy trình thanh toán.",
    instead: "thay thế.",
    comparison: "So sánh các gói VLABS",
    caption:
      "Bảng so sánh các gói VLABS tham khảo, tính năng và mức giá theo tháng hoặc năm",
    comparisonNote:
      "Trước khi mua, vui lòng xác nhận tính năng đã phát hành, giới hạn học sinh và quản trị viên, đơn vị SSO được hỗ trợ, phạm vi hướng dẫn triển khai, hỗ trợ kỹ thuật, điều kiện hủy, điều kiện hoàn tiền, thuế áp dụng và trạng thái thanh toán. Giá được hiển thị bằng VND. SePay tiếp nhận khoản thanh toán một lần cho kỳ tháng hoặc năm được chọn. Việc gia hạn được thực hiện thủ công và hệ thống không tự động thu tiền.",
  },

  form: {
    allRequired: "Vui lòng điền đầy đủ các trường bắt buộc.",
    name: "Họ và tên",
    email: "Địa chỉ email",
    phone: "Số điện thoại",
    message: "VLABS có thể hỗ trợ bạn như thế nào?",
    phoneHelp:
      "Vui lòng nhập cả mã quốc gia để đội ngũ có thể liên hệ với bạn thuận tiện hơn.",
    messageHelp:
      "Hãy chia sẻ mục tiêu học tập, môn học ưu tiên, nhóm người học, khó khăn hiện tại, số lượng người dùng dự kiến và phạm vi thử nghiệm mong muốn. Nội dung tối đa 5.000 ký tự.",
    privacy:
      "Thông tin của bạn sẽ được gửi đến dịch vụ quản lý liên hệ để đội ngũ VLABS xem xét và phản hồi yêu cầu. Vui lòng không cung cấp hồ sơ học sinh, mật khẩu, thông tin thẻ thanh toán, thông tin sức khỏe, giấy tờ định danh hoặc dữ liệu nhạy cảm khác. Xem",
    privacyLink: "Chính sách quyền riêng tư",
    preferEmail: "Bạn muốn liên hệ trực tiếp qua email?",
    requiredName: "Vui lòng nhập họ và tên của bạn.",
    requiredEmail: "Vui lòng nhập địa chỉ email của bạn.",
    invalidEmail: "Vui lòng nhập một địa chỉ email hợp lệ.",
    requiredPhone: "Vui lòng nhập số điện thoại của bạn.",
    requiredMessage:
      "Hãy chia sẻ một vài thông tin về nhu cầu để chúng tôi có thể hỗ trợ bạn phù hợp hơn.",
    tooLong:
      "Vui lòng rút gọn nội dung để không vượt quá giới hạn ký tự cho phép.",
    required: "Vui lòng điền thông tin cho trường này.",
    review: "Vui lòng kiểm tra các trường được đánh dấu trước khi gửi yêu cầu.",
    sending: "Đang gửi…",
    pending:
      "Yêu cầu của bạn đang được gửi. Vui lòng giữ trang này mở trong giây lát.",
    submit: "Gửi yêu cầu trao đổi",
    failed:
      "Chúng tôi chưa thể gửi yêu cầu của bạn vào lúc này. Vui lòng kiểm tra lại thông tin và thử lại.",
    failureHelp:
      "Nếu sự cố vẫn tiếp diễn, bạn có thể liên hệ trực tiếp với đội ngũ VLABS qua địa chỉ email hiển thị bên dưới.",
    contactReceived:
      "Cảm ơn bạn. VLABS đã nhận được yêu cầu. Đội ngũ sẽ xem xét nội dung và có thể liên hệ lại qua thông tin bạn cung cấp.",
    leadReceived:
      "Cảm ơn bạn đã quan tâm đến VLABS. Chúng tôi đã nhận được yêu cầu trao đổi về sản phẩm và có thể liên hệ với bạn để cùng xác định bước tiếp theo phù hợp.",
    timeout:
      "Hệ thống chưa thể xác nhận yêu cầu trong thời gian dự kiến. Vui lòng thử lại hoặc liên hệ trực tiếp với đội ngũ VLABS qua email.",
    connection:
      "Hệ thống chưa thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối Internet và thử lại, hoặc liên hệ trực tiếp với đội ngũ VLABS qua email.",
  },

  checkout: {
    title: "Thanh toán gói {plan}",
    close: "Đóng trang thanh toán",
    monthlySummary:
      "{amount} cho kỳ sử dụng một tháng. Thanh toán trước một lần bằng VND qua SePay. Bạn chủ động lựa chọn gia hạn khi hết kỳ; hệ thống không tự động thu tiền cho kỳ tiếp theo.",
    yearlySummary:
      "{amount} cho kỳ sử dụng một năm. Toàn bộ số tiền được thanh toán trước một lần bằng VND qua SePay. Bạn chủ động lựa chọn gia hạn khi hết kỳ; hệ thống không tự động thu tiền cho kỳ tiếp theo.",
    terms:
      "Vui lòng xác nhận trạng thái thanh toán và mức độ phù hợp của gói trước khi chuyển tiền. Quyền truy cập, hướng dẫn triển khai, ngày bắt đầu dịch vụ, gia hạn, hủy, hoàn tiền, thuế, hỗ trợ và trách nhiệm của các bên cần được xem xét cùng đội ngũ VLABS. Việc thanh toán không tự động tạo hoặc kích hoạt tài khoản học tập trên website này. Trang quay lại hoặc URL quay lại trên trình duyệt không tự động được xem là bằng chứng giao dịch đã thành công.",
    allRequired: "Vui lòng điền đầy đủ các trường bắt buộc.",
    name: "Họ và tên",
    email: "Địa chỉ email",
    requiredName: "Vui lòng nhập họ và tên của bạn.",
    requiredEmail: "Vui lòng nhập địa chỉ email của bạn.",
    invalidEmail: "Vui lòng nhập một địa chỉ email hợp lệ.",
    tooLong:
      "Vui lòng rút gọn nội dung để không vượt quá giới hạn ký tự cho phép.",
    review:
      "Vui lòng kiểm tra các trường được đánh dấu trước khi tiếp tục thanh toán.",
    privacy:
      "Họ tên, địa chỉ email và gói bạn lựa chọn sẽ được gửi đến máy chủ website để chuẩn bị yêu cầu thanh toán. Trước khi trả tiền, vui lòng kiểm tra đơn vị thanh toán, người nhận, số tiền, đơn vị tiền tệ, tên gói và điều khoản xử lý dữ liệu áp dụng. Xem",
    privacyLink: "Chính sách quyền riêng tư",
    termsLink: "Điều khoản và điều kiện",
    and: "và",
    loading: "Đang chuẩn bị thanh toán…",
    continue: "Tiếp tục đến SePay",
    pending:
      "Trang thanh toán SePay đang được chuẩn bị. Vui lòng giữ trang này mở.",
    contact: "Liên hệ đội ngũ VLABS",
    unavailable:
      "Thanh toán trực tuyến chưa khả dụng cho lựa chọn này. Vui lòng liên hệ đội ngũ VLABS.",
    unavailableContact: "Liên hệ VLABS về thanh toán",
    retry: "Vui lòng thử lại hoặc liên hệ với đội ngũ VLABS để được hỗ trợ.",
    failed:
      "Chưa thể mở trang thanh toán. Vui lòng thử lại hoặc liên hệ với đội ngũ VLABS để được hỗ trợ.",
    invalidLink:
      "Hệ thống chưa thể xác minh liên kết thanh toán. Vui lòng liên hệ với đội ngũ VLABS trước khi nhập thông tin hoặc thực hiện chuyển tiền.",
    timeout:
      "Hệ thống thanh toán chưa phản hồi trong thời gian dự kiến. Vui lòng thử lại hoặc liên hệ với đội ngũ VLABS.",
    connection:
      "Chưa thể mở trang thanh toán. Vui lòng kiểm tra kết nối Internet và thử lại.",
  },
};

export type Messages = typeof en;
export type FormCopy = typeof en.form;
export type CheckoutCopy = typeof en.checkout;

export function getMessages(locale: Locale): Messages {
  return locale === "vi" ? vi : en;
}

const screenshotKeys = {
  "/images/products/vlabs-virtual-lab.webp": "circuit",
  "/images/products/vlabs-projectile-lab.webp": "projectile",
  "/images/products/vlabs-lab-catalog.webp": "catalog",
  "/images/products/vlabs-student-dashboard.webp": "student",
  "/images/products/vlabs-student-progress.webp": "progress",
  "/images/products/vlabs-teacher-dashboard.webp": "teacher",
  "/images/products/role-student.webp": "roleStudent",
  "/images/products/role-teacher.webp": "roleTeacher",
  "/images/products/role-admin.webp": "roleAdministrator",
} as const;

export function getScreenshotCopy(src: string | undefined, locale: Locale) {
  // Published CMS replacements must not inherit another image's description
  // or a demo provenance claim. Only these exact captured assets are known.
  if (!src || !Object.prototype.hasOwnProperty.call(screenshotKeys, src)) return undefined;
  const key = screenshotKeys[src as keyof typeof screenshotKeys];
  return getMessages(locale).screenshots[key];
}
