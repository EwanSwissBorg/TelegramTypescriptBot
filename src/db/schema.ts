export interface Project {
    id: number;
    userId: string;
    twitterUsername: string;
    projectName: string;
    description: string;
    projectPicture: string;
    websiteLink: string;
    communityLink: string;
    xLink: string;
    chain: string;
    sector: string;
    tgeDate: string;
    fdv: string;
    ticker: string;
    tokenPicture: string;
    dataRoom: string;
    createdAt: Date;
    updatedAt: Date;
}

export const createTableSQL = `
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
)`; 