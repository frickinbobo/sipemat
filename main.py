from flask import Flask, render_template, jsonify
import sqlite3

app = Flask(__name__)

@app.route("/dashboard/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/kartu-bimbingan/kartu-putih/")
def kartu_putih():
    return render_template('kartu-putih.html')


@app.route("/api/get/dosen/")
def get_dosen():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM dosen")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]

    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))

    conn.close()
    return jsonify(data)

@app.route("/api/get/mahasiswa/")
def get_mahasiswa():
    conn = sqlite3.connect('./db/database.db')
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM mahasiswa")
    rows = cursor.fetchall()
    column_names = [description[0] for description in cursor.description]

    data = []
    for row in rows:
        data.append(dict(zip(column_names, row)))
        
    conn.close()
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5678)
