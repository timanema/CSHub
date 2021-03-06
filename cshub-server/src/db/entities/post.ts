import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Topic } from "./topic";
import { IPost } from "../../../../cshub-shared/src/entities/post";
import { Exclude, Expose } from "class-transformer";

@Exclude()
@Entity({
    name: "posts"
})
@Index("uq_title_topic", ["title", "topic"], {
    unique: true
})
export class Post implements IPost {
    @Expose()
    @PrimaryGeneratedColumn()
    id!: number;

    @Expose()
    @ManyToOne(type => Topic, topic => topic.posts, {
        nullable: false
    })
    @JoinColumn({ name: "topic" })
    @Index()
    topic!: Topic;

    @Expose()
    @Column({
        type: "datetime",
        default: () => "CURRENT_TIMESTAMP"
    })
    datetime!: Date;

    @Expose()
    @Column({
        type: "varchar",
        length: 127
    })
    title!: string;

    @Expose()
    @Column({
        unique: true
    })
    hash!: number;

    @Expose()
    @Column({
        default: 0
    })
    @Index()
    postVersion!: number;

    @Expose()
    @Column({
        type: "int", // Otherwise it overrides the value
        default: false
    })
    @Index()
    deleted!: boolean;

    @Expose()
    @Column({
        type: "int", // Otherwise it overrides the value
        default: true
    })
    @Index()
    wip!: boolean;

    @Expose()
    @Column({
        type: "int", // Otherwise it overrides the value
        default: false
    })
    @Index()
    isIndex!: boolean;

    @Expose()
    @Column({
        default: false
    })
    @Index()
    isExample!: boolean;
}
