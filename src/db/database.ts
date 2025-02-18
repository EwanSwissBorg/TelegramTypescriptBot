import BetterSqlite3, { Database } from 'better-sqlite3';
import { Project } from './schema';

export class ProjectDatabase {
    private db: Database;

    constructor(dbPath: string) {
        this.db = new BetterSqlite3(dbPath);
        this.init();
    }

    private init() {
        const createTable = `
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT NOT NULL,
                twitterUsername TEXT NOT NULL,
                projectName TEXT NOT NULL,
                description TEXT NOT NULL,
                projectPicture TEXT,
                websiteLink TEXT NOT NULL,
                communityLink TEXT NOT NULL,
                xLink TEXT NOT NULL,
                chain TEXT NOT NULL,
                sector TEXT NOT NULL,
                tgeDate TEXT NOT NULL,
                fdv TEXT NOT NULL,
                ticker TEXT NOT NULL,
                tokenPicture TEXT,
                dataRoom TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        this.db.exec(createTable);
    }

    async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) {
        const stmt = this.db.prepare(`
            INSERT INTO projects (
                userId, twitterUsername, projectName, description, projectPicture,
                websiteLink, communityLink, xLink, chain, sector,
                tgeDate, fdv, ticker, tokenPicture, dataRoom
            ) VALUES (
                @userId, @twitterUsername, @projectName, @description, @projectPicture,
                @websiteLink, @communityLink, @xLink, @chain, @sector,
                @tgeDate, @fdv, @ticker, @tokenPicture, @dataRoom
            )
        `);
        
        return stmt.run(project);
    }

    async getProjectByUserId(userId: string): Promise<Project | undefined> {
        const stmt = this.db.prepare('SELECT * FROM projects WHERE userId = ?');
        return stmt.get(userId) as Project | undefined;
    }

    async getAllProjects(): Promise<Project[]> {
        const stmt = this.db.prepare('SELECT * FROM projects ORDER BY createdAt DESC');
        return stmt.all() as Project[];
    }

    async updateProject(project: Partial<Project> & { id: number }) {
        const updates = Object.entries(project)
            .filter(([key]) => key !== 'id')
            .map(([key]) => `${key} = @${key}`)
            .join(', ');

        const stmt = this.db.prepare(`
            UPDATE projects 
            SET ${updates}, updatedAt = CURRENT_TIMESTAMP 
            WHERE id = @id
        `);
        
        return stmt.run(project);
    }

    async deleteProject(id: number) {
        const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
        return stmt.run(id);
    }
} 