---
title: "Bảng giá"
meta_title: "Bảng giá VLABS | Gói dành cho lớp học và nhà trường"
description: "Tham khảo các gói VLABS theo tài khoản người dùng. Lựa chọn phạm vi phù hợp với lớp học, nhà trường hoặc hệ thống giáo dục."
draft: false

page_header:
  title: "Lựa chọn phù hợp với <strong>nhu cầu dạy và học</strong>"
  content: "VLABS kết hợp mô phỏng khoa học với công cụ quản lý học tập. So sánh các gói tham khảo cho lớp học, nhà trường và hệ thống giáo dục. Giá VND tính theo tài khoản; xác nhận tính năng khả dụng và phạm vi triển khai với VLABS."

toggler:
  monthly_label: "Thanh toán theo tháng"
  yearly_label: "Thanh toán theo năm"

plans:
  - title: "Starter"
    plan_id: "starter"
    price: "69000"
    yearly_price: "690000"
    is_featured: false
    button:
      enable: true
      label: "Bắt đầu với Starter"
      link: "/contact"
    description: "Dành cho giáo viên, lớp học và tổ bộ môn muốn bắt đầu với mô phỏng tương tác cùng các công cụ quản lý học tập thiết yếu."
    price_note: "69.000 VND/tài khoản/tháng"
    yearly_price_note: "690.000 VND/tài khoản/năm"
    features:
      - label: "Mô phỏng khoa học tương tác"
        included: true
      - label: "Khóa học và bài tập"
        included: true
        tooltip: "Giáo viên có thể tổ chức nội dung, giao hoạt động và tiếp nhận bài làm của học sinh."
      - label: "Sổ điểm và theo dõi kết quả"
        included: true
      - label: "Không gian dành cho giáo viên và học sinh"
        included: true
      - label: "Luyện tập thích ứng"
        included: false
      - label: "Phân tích học tập nâng cao"
        included: false
      - label: "Bảng điều khiển quản trị"
        included: false

  - title: "Campus"
    plan_id: "campus"
    price: "79000"
    yearly_price: "790000"
    is_featured: true
    button:
      enable: true
      label: "Liên hệ VLABS"
      link: "/contact"
    description: "Dành cho nhà trường muốn kết nối mô phỏng, bài tập và dữ liệu học tập để hỗ trợ giáo viên theo dõi nhiều lớp học hiệu quả hơn."
    price_note: "79.000 VND/tài khoản/tháng"
    yearly_price_note: "790.000 VND/tài khoản/năm"
    features:
      - label: "Toàn bộ tính năng Starter"
        included: true
      - label: "Thư viện mô phỏng mở rộng"
        included: true
      - label: "Luyện tập thích ứng"
        included: true
        tooltip: "Hỗ trợ tổ chức hoạt động luyện tập phù hợp với tiến độ và kết quả học tập của người học."
      - label: "Phân tích học tập cho giáo viên"
        included: true
      - label: "Theo dõi tiến độ theo lớp"
        included: true
      - label: "Hỗ trợ triển khai cho giáo viên"
        included: true
      - label: "Bảng điều khiển quản trị toàn hệ thống"
        included: false

  - title: "Enterprise"
    plan_id: "enterprise"
    price: "99000"
    yearly_price: "990000"
    is_featured: false
    button:
      enable: true
      label: "Liên hệ VLABS"
      link: "/contact"
    description: "Dành cho cơ sở giáo dục và hệ thống trường học cần khả năng quản trị tập trung, tích hợp hệ thống và hỗ trợ triển khai chuyên sâu."
    price_note: "99.000 VND/tài khoản/tháng"
    yearly_price_note: "990.000 VND/tài khoản/năm"
    features:
      - label: "Toàn bộ tính năng Campus"
        included: true
      - label: "Bảng điều khiển quản trị và báo cáo"
        included: true
      - label: "Quản lý nhiều trường hoặc đơn vị"
        included: true
      - label: "SSO và phân quyền nâng cao"
        included: true
        tooltip: "Khả năng tích hợp phụ thuộc vào hệ thống định danh, yêu cầu bảo mật và hạ tầng hiện có của đơn vị."
      - label: "Tích hợp với hệ thống hiện có"
        included: true
      - label: "Phát triển mô phỏng theo yêu cầu"
        included: true
        tooltip: "Phạm vi, thời gian và chi phí phát triển được xác định riêng theo từng yêu cầu."
      - label: "Chuyên viên đồng hành triển khai"
        included: true

comparison:
  enable: true
  title: "So sánh gói <strong>theo nhu cầu sử dụng</strong>"
  headers:
    - label: "Tính năng"
    - label: "Starter"
      plan_id: "starter"
    - label: "Campus"
      plan_id: "campus"
    - label: "Enterprise"
      plan_id: "enterprise"

  rows:
    - feature: "Giá mỗi tài khoản/tháng"
      kind: "monthly_price"
      values: ["69.000 VND", "79.000 VND", "99.000 VND"]

    - feature: "Giá mỗi tài khoản/năm"
      kind: "yearly_price"
      values: ["690.000 VND", "790.000 VND", "990.000 VND"]

    - feature: "Mô phỏng khoa học tương tác"
      values: [true, true, true]

    - feature: "Khóa học và bài tập"
      values: [true, true, true]

    - feature: "Sổ điểm và theo dõi kết quả"
      values: [true, true, true]

    - feature: "Thư viện mô phỏng mở rộng"
      values: [false, true, true]

    - feature: "Luyện tập thích ứng"
      values: [false, true, true]

    - feature: "Phân tích học tập cho giáo viên"
      values: [false, true, true]

    - feature: "Theo dõi tiến độ theo lớp"
      values: [false, true, true]

    - feature: "Bảng điều khiển quản trị"
      values: [false, false, true]

    - feature: "Quản lý nhiều trường hoặc đơn vị"
      values: [false, false, true]

    - feature: "SSO và phân quyền nâng cao"
      values: [false, false, true]

    - feature: "Mức độ hỗ trợ"
      values:
        - "Hỗ trợ trực tuyến"
        - "Hỗ trợ ưu tiên và hướng dẫn triển khai"
        - "Chuyên viên đồng hành triển khai"

pricing_note:
  enable: true
  title: "Thông tin về mức giá"
  content: "Giá trên được tính theo tài khoản người dùng và chưa bao gồm thuế giá trị gia tăng. Giá thanh toán theo năm tương đương 10 tháng sử dụng. Chi phí phát triển mô phỏng, tích hợp hệ thống hoặc triển khai theo yêu cầu riêng sẽ được xác định sau khi VLABS trao đổi với đơn vị."
---
